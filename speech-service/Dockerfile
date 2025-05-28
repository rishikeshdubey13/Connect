FROM python:3.12
WORKDIR /speech-service
ENV FLASK_APP=app.py
ENV FLASK_ENV=development
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5003
CMD ["python3", "speech-app.py"]