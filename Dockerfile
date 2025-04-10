FROM python:3.12

WORKDIR /backend/app

COPY . .

ENV FLASK_APP=app.py
ENV FLASK_ENV=development

COPY    requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

Expose 5001

CMD ["flask", "run","--host", "0.0.0.0","--port","5001"]