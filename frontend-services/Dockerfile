FROM python:3.12
WORKDIR /app
ENV FLASK_APP=app.py
ENV FLASK_ENV=development
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3000
CMD ["python3", "frontend-app.py"]