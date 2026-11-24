import os
import re
import google.generativeai as genai
from typing import List, Tuple, Dict, Any
from app.services.document_processor import get_document_processor

class RAGService:
    def __init__(self):
        self._processor = None
        self.google_api_key = os.getenv("GOOGLE_API_KEY")
        
        if self.google_api_key:
            try:
                genai.configure(api_key=self.google_api_key)
                self.model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
                self.gemini_model = genai.GenerativeModel(self.model_name)
                print(f"DEBUG: Gemini Model Connected ({self.model_name})")
            except Exception as e:
                print(f"Gemini Init Error: {e}")
                self.model_name = "gemini-3.5-flash"
                self.gemini_model = None
        else:
            self.model_name = "gemini-3.5-flash"
            self.gemini_model = None
    
    @property
    def document_processor(self):
        if self._processor is None:
            self._processor = get_document_processor()
        return self._processor

    def generate_response(self, query: str, context_chunks: List[str], history: List[Dict[str, str]] = []) -> str:
        """
        Generate response using History + Document Context
        """
        context_str = "\n\n---\n\n".join(context_chunks) if context_chunks else "No relevant document section found."
        
        # Build Chat History String for Prompt
        chat_history_str = ""
        # Take last 5 messages to avoid token limit, skipping the very last one (which is the current query)
        recent_history = history[-6:-1] if len(history) > 1 else [] 
        
        for msg in recent_history:
            role = "User" if msg['role'] == 'user' else "AI"
            chat_history_str += f"{role}: {msg['content']}\n"

        system_instruction = """You are a Document Analysis AI. Your primary mission is to answer questions based on the provided document.

[STRICT RULES]
1. **PRIORITY**: You MUST look for the answer in the [Document Content] first. Search thoroughly through all provided document chunks.
2. **SOURCE TRUTH**: For specific fact-checking, use ONLY the document. Extract information directly from the document content.
3. **PAGE CITATIONS**: You MUST cite the source page for every piece of information or fact you provide using the format `(Page X/Y)` or `(Page X)` or `(X/Y)` (e.g., `(Page 2/3)` or `(Page 2)`), referencing the page headers in the provided document chunks.
4. **CREATIVE TASKS**: If the user asks for summaries, quizzes, or lists (e.g. "10 questions"), you may EXTRAPOLATE from the provided content to generate full results, as long as they are relevant to the document topics. However, when answering those questions, you MUST base your answers on the document content provided and include page citations.
5. **LANGUAGE**: You MUST ALWAYS respond in ENGLISH, regardless of the language of the user's question. If the document is in a different language, translate the relevant information to English. Never respond in Turkish or any other language - always use English.
6. **FALLBACK**: Only if the document is completely silent on the topic after thorough searching, you may use your general knowledge, but you MUST clearly state "This information is not found in the uploaded document. Based on general knowledge: [answer]"
7. **IMPORTANT**: When the user asks "what does the PDF say?" or "what about is pdf", they are asking about the CONTENT of the uploaded document, NOT about PDFs as a file format. Always answer based on the document content provided.
8. **ANSWER ACCURACY**: Quote or reference specific facts with page citations. If you cannot find the answer in the provided document chunks, state clearly: "I could not find a direct answer to this question in the uploaded document." Do not make up answers."""

        user_prompt = f"""[Conversation History]
{chat_history_str}

[Document Content]
{context_str}

[Current User Question]
{query}

**IMPORTANT INSTRUCTIONS:**
- You MUST answer based on the [Document Content] provided above
- You MUST include exact page citations (e.g., (Page 1/3) or (1/3)) referencing where in the document each fact was found
- Search through all the document chunks carefully to find relevant information
- Quote specific information from the document when possible
- If information is not in the document, clearly state that
- Always respond in ENGLISH only

Answer:"""

        # 1. Gemini
        if self.gemini_model:
            candidate_models = [self.model_name, "gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-3.8-flash"]
            models_to_try = []
            for m in candidate_models:
                if m not in models_to_try:
                    models_to_try.append(m)

            full_prompt = f"{system_instruction}\n\n{user_prompt}"
            for m_name in models_to_try:
                try:
                    m_instance = genai.GenerativeModel(m_name)
                    response = m_instance.generate_content(
                        full_prompt,
                        generation_config=genai.types.GenerationConfig(
                            temperature=0.7,
                        )
                    )
                    if response and response.text:
                        return response.text
                except Exception as e:
                    print(f"Gemini model {m_name} call failed: {e}")
                    continue

            if context_chunks:
                return (
                    "⚠️ **Notice: Gemini API Free-Tier Rate Limit Reached**.\n\n"
                    "**Direct Document Information & Citations:**\n\n" + "\n\n---\n\n".join(context_chunks[:2])
                )
            return "⚠️ Gemini API rate limit reached. Please wait a moment and try again."
        
        # 2. OpenAI Fallback
        processor = self.document_processor
        if processor.openai_client:
            try:
                full_prompt = f"{system_instruction}\n\n{user_prompt}"
                response = processor.openai_client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": full_prompt}],
                    temperature=0.7
                )
                return response.choices[0].message.content
            except Exception as e:
                print(f"OpenAI Error: {e}")

        # 3. No Brain Fallback
        if not context_chunks:
            return "I am in Offline Mode (No AI Key). I can only search specific terms, not chat."
            
        return "Offline Mode - Search Results:\n" + "\n".join(context_chunks[:2])

    def query(self, user_query: str, history: List[Dict[str, str]] = [], document_id: str = None) -> Tuple[str, List[str]]:
        """
        Stateful Query Handler
        document_id: If provided, only search within this specific document
        """
        processor = self.document_processor
        
        # Preprocess query: Remove generic terms that don't help search
        # If user asks "what does the PDF say?", search for document content instead
        search_query = user_query.lower()
        
        # Replace generic PDF/document queries with better search terms
        if any(phrase in search_query for phrase in ["what does the pdf say", "what about is pdf", "what is in the pdf", "pdf say", "document say"]):
            # Try to get any content from documents - use a very generic query
            search_query = "content information text"
        else:
            # Use original query but remove stop words that might interfere
            # Keep the original query for semantic search
            search_query = user_query
        
        # 2. Search Vector DB
        # Dynamic Context Limit: Increase window for broad generation tasks and question answering
        broad_keywords = ['summary', 'summarize', 'overview', 'questions', 'quiz', 'list', 'create', 'generate', 'answer']
        question_keywords = ['what', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe', 'tell']
        
        # Increase limit for better context retrieval
        if any(k in user_query.lower() for k in broad_keywords):
            limit = 15
        elif any(k in user_query.lower() for k in question_keywords):
            limit = 12
        else:
            limit = 8
        
        results = processor.search_documents(search_query, n_results=limit, document_id=document_id)
        
        context_chunks = []
        if results:
            # Filter out results with very high distance (low similarity)
            # Keep results with distance < 1.5 (lower is better for cosine distance)
            context_chunks = [doc for doc, dist in results if dist < 1.5]
            # If we filtered too much, include some more
            if len(context_chunks) < 3 and results:
                context_chunks = [doc for doc, dist in results[:limit]]
        
        # Check for page-specific query override (e.g. "what is on page 2")
        page_match = re.search(r'\bpage\s+(\d+)\b', user_query.lower())
        if page_match:
            target_page = int(page_match.group(1))
            try:
                where_filter = {"page_number": target_page}
                if document_id:
                    where_filter = {"$and": [{"document_id": document_id}, {"page_number": target_page}]}
                page_res = processor.collection.get(where=where_filter)
                if page_res and page_res.get('documents'):
                    context_chunks = page_res['documents'] + context_chunks
            except Exception:
                if hasattr(processor, '_document_pages') and document_id in processor._document_pages:
                    for p_num, p_text in processor._document_pages[document_id]:
                        if p_num == target_page:
                            total_p = len(processor._document_pages[document_id])
                            context_chunks = [f"[Page {p_num}/{total_p}]\n{p_text}"] + context_chunks
                            break
        
        # If no results found, try a more generic search
        if not context_chunks:
            # Try searching with just common words from the query
            words = [w for w in user_query.lower().split() if len(w) > 3 and w not in ['what', 'does', 'the', 'pdf', 'say', 'about', 'is', 'are', 'can', 'you', 'this', 'that', 'these', 'those']]
            if words:
                fallback_query = " ".join(words[:5])  # Use first 5 meaningful words
                fallback_results = processor.search_documents(fallback_query, n_results=8, document_id=document_id)
                if fallback_results:
                    context_chunks = [doc for doc, dist in fallback_results if dist < 1.5]
                    if not context_chunks and fallback_results:
                        context_chunks = [doc for doc, dist in fallback_results[:5]]
            
        # If still no results, try to get ANY document content (more chunks for better context)
        if not context_chunks:
            try:
                # Get documents from collection, filtered by document_id if provided
                if document_id:
                    # Get only chunks from the specified document
                    try:
                        # Try the $eq operator syntax (newer ChromaDB versions)
                        all_results = processor.collection.get(
                            where={"document_id": {"$eq": document_id}}
                        )
                    except:
                        # Fallback to simple equality (older ChromaDB versions)
                        all_results = processor.collection.get(
                            where={"document_id": document_id}
                        )
                else:
                    # Get all documents
                    all_results = processor.collection.get()
                    
                if all_results and all_results.get('documents'):
                    # Get more chunks as context to improve answer quality
                    context_chunks = all_results['documents'][:10]
            except Exception as e:
                print(f"Fallback search error: {e}")
            
        # 3. Generate Logic
        response = self.generate_response(user_query, context_chunks, history)
        
        sources = ["Document"] if context_chunks else ["General Knowledge"]
        return response, sources

rag_service = RAGService()
