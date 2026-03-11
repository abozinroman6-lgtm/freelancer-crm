FROM python:3.11-slim

WORKDIR /app

# Копируем зависимости
COPY backend/requirements.txt .

# Устанавливаем зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь код
COPY backend /app/backend

# Переходим в папку с кодом
WORKDIR /app/backend

# Запускаем
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]