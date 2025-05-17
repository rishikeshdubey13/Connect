from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    return "Frontend Service Running"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)