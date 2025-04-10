from flask import Flask 
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

@app.route('/')
def home():
    return "Hello FLask"

if __name__ == '__main__':
    app.run(host = "0.0.0.0", port = 5001, debug=True)
