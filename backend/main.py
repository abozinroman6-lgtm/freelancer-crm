from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
import os

# ---------- База данных ----------
SQLALCHEMY_DATABASE_URL = "sqlite:///./crm.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ---------- Модели ----------
class Client(Base):
    __tablename__ = "clients"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    phone = Column(String)
    company = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    
    projects = relationship("Project", back_populates="client")

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    hourly_rate = Column(Float, default=0)
    status = Column(String, default="active")  # active, completed, paused
    deadline = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    
    client = relationship("Client", back_populates="projects")
    time_entries = relationship("TimeEntry", back_populates="project")

class TimeEntry(Base):
    __tablename__ = "time_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    start_time = Column(DateTime)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Integer, default=0)  # в секундах
    description = Column(String, nullable=True)
    
    project = relationship("Project", back_populates="time_entries")

# Создаём таблицы
Base.metadata.create_all(bind=engine)

# ---------- Pydantic схемы ----------
class ClientBase(BaseModel):
    name: str
    email: str
    phone: str
    company: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: int
    created_at: datetime
    projects: List = []

    class Config:
        from_attributes = True

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    client_id: int
    hourly_rate: float
    status: str = "active"
    deadline: Optional[datetime] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    created_at: datetime
    total_time: int = 0
    total_earned: float = 0

    class Config:
        from_attributes = True

class TimeEntryBase(BaseModel):
    project_id: int
    description: Optional[str] = None

class TimeEntryStart(TimeEntryBase):
    pass

class TimeEntryStop(BaseModel):
    entry_id: int

class TimeEntryResponse(BaseModel):
    id: int
    project_id: int
    start_time: datetime
    end_time: Optional[datetime]
    duration: int
    description: Optional[str]

    class Config:
        from_attributes = True

# ---------- Зависимости ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- FastAPI приложение ----------
app = FastAPI(title="Freelancer CRM")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Клиенты ----------
@app.post("/api/clients", response_model=ClientResponse)
def create_client(client: ClientCreate, db: Session = Depends(get_db)):
    db_client = Client(**client.dict())
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

@app.get("/api/clients", response_model=List[ClientResponse])
def list_clients(db: Session = Depends(get_db)):
    return db.query(Client).all()

@app.get("/api/clients/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "Client not found")
    return client

@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "Client not found")
    db.delete(client)
    db.commit()
    return {"ok": True}

# ---------- Проекты ----------
@app.post("/api/projects", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(**project.dict())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@app.get("/api/projects", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    result = []
    for p in projects:
        # Считаем общее время
        entries = db.query(TimeEntry).filter(TimeEntry.project_id == p.id).all()
        total_seconds = sum(e.duration for e in entries if e.duration)
        p.total_time = total_seconds
        p.total_earned = (total_seconds / 3600) * p.hourly_rate
        result.append(p)
    return result

@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    entries = db.query(TimeEntry).filter(TimeEntry.project_id == project.id).all()
    total_seconds = sum(e.duration for e in entries if e.duration)
    project.total_time = total_seconds
    project.total_earned = (total_seconds / 3600) * project.hourly_rate
    return project

@app.put("/api/projects/{project_id}/status")
def update_status(project_id: int, status: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    project.status = status
    db.commit()
    return {"ok": True}

# ---------- Time tracking ----------
active_timers = {}

@app.post("/api/time/start", response_model=TimeEntryResponse)
def start_timer(entry: TimeEntryStart, db: Session = Depends(get_db)):
    db_entry = TimeEntry(
        project_id=entry.project_id,
        start_time=datetime.now(),
        description=entry.description
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    active_timers[entry.project_id] = db_entry.id
    return db_entry

@app.post("/api/time/stop")
def stop_timer(data: TimeEntryStop, db: Session = Depends(get_db)):
    entry = db.query(TimeEntry).filter(TimeEntry.id == data.entry_id).first()
    if not entry:
        raise HTTPException(404, "Time entry not found")
    
    entry.end_time = datetime.now()
    duration = entry.end_time - entry.start_time
    entry.duration = int(duration.total_seconds())
    db.commit()
    
    if entry.project_id in active_timers:
        del active_timers[entry.project_id]
    
    return {"ok": True, "duration": entry.duration}

@app.get("/api/time/project/{project_id}")
def get_project_time(project_id: int, db: Session = Depends(get_db)):
    entries = db.query(TimeEntry).filter(TimeEntry.project_id == project_id).all()
    return entries

# ---------- Экспорт ----------
@app.get("/api/export/project/{project_id}/csv")
def export_project_csv(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    entries = db.query(TimeEntry).filter(TimeEntry.project_id == project_id).all()
    
    csv = "Start,End,Duration (s),Description\n"
    for e in entries:
        start = e.start_time.strftime("%Y-%m-%d %H:%M")
        end = e.end_time.strftime("%Y-%m-%d %H:%M") if e.end_time else ""
        csv += f"{start},{end},{e.duration},{e.description or ''}\n"
    
    return Response(content=csv, media_type="text/csv", headers={
        "Content-Disposition": f"attachment; filename=project_{project_id}.csv"
    })

# ---------- Запуск ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)