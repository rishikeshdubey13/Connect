FROM python:3.12

WORKDIR /backend

ENV FLASK_APP=app.py
ENV FLASK_ENV=development

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

CMD ["flask", "run", "--host", "0.0.0.0", "--port", "5001"]