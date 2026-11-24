from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path
import shutil
from datetime import datetime

from app.models.schemas import UploadResponse
from app.services.document_processor import get_document_processor

router = APIRouter()

ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx'}


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload and process a document"""
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    upload_path = None
    try:
        # Save uploaded file temporarily (in backend/uploads directory)
        upload_path = Path("uploads") / file.filename
        upload_path.parent.mkdir(exist_ok=True, parents=True)
        
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process the document
        processor = get_document_processor()
        document_id = processor.process_document(upload_path, file.filename)
        
        return UploadResponse(
            message="Document uploaded and processed successfully",
            document_id=document_id,
            filename=file.filename
        )
    except Exception as e:
        # Clean up on error
        if upload_path and upload_path.exists():
            try:
                upload_path.unlink()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@router.get("/file/{filename}")
async def get_document_file(filename: str):
    """Serve uploaded document file for inline browser viewing"""
    file_path = Path("uploads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document file not found")
    
    media_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{file_path.name}"',
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600"
        }
    )


@router.get("/list")
async def list_documents():
    """List all processed documents in uploads"""
    try:
        uploads_dir = Path("uploads")
        docs = []
        if uploads_dir.exists():
            for f in sorted(uploads_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
                if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
                    stat = f.stat()
                    docs.append({
                        "filename": f.name,
                        "size": stat.st_size,
                        "upload_date": datetime.fromtimestamp(stat.st_mtime).strftime("%b %d, %Y"),
                        "status": "Ready"
                    })
        return {"documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing documents: {str(e)}")


@router.delete("/all")
async def delete_all_documents():
    """Delete all uploaded documents and reset ChromaDB collection"""
    try:
        uploads_dir = Path("uploads")
        if uploads_dir.exists():
            for f in uploads_dir.iterdir():
                if f.is_file():
                    try:
                        f.unlink()
                    except Exception:
                        pass
        
        # Reset ChromaDB collection
        processor = get_document_processor()
        try:
            processor.client.delete_collection(name="documents")
            processor.collection = processor.client.get_or_create_collection(name="documents")
        except Exception as e:
            print(f"ChromaDB collection reset error: {e}")
        
        # Clear in-memory pages
        processor._document_pages = {}
        
        return {"message": "All documents deleted and index cleared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete all documents: {str(e)}")


@router.delete("/file/{filename}")
async def delete_document_file(filename: str):
    """Delete a single document and remove its embeddings from ChromaDB"""
    file_path = Path("uploads") / filename
    if file_path.exists():
        try:
            file_path.unlink()
            
            # Remove from ChromaDB collection
            processor = get_document_processor()
            try:
                processor.collection.delete(where={"filename": filename})
            except Exception as e:
                print(f"ChromaDB delete error: {e}")
                
            return {"message": f"Document {filename} deleted successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")
    raise HTTPException(status_code=404, detail="File not found")


