FROM python:3.12
WORKDIR /signalling-services
ENV FLASK_APP=app.py
ENV FLASK_ENV=development
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5001
CMD ["python3", "signalling-app.py"]
# This Dockerfile is for a signalling service that uses Flask and Python 3.12.