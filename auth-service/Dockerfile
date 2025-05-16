FROM python:3.12
WORKDIR /app
ENV FLASK_APP=app.py
ENV FLASK_ENV=development
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5002
CMD ["python3", "auth-app.py"]
# # This Dockerfile is for an authentication service that uses Flask and Python 3.12.
       