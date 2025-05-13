from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
import time
import os

time.sleep(15)  # Wait for the database to be ready

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://user:Zompire%40@db:5432/authdb')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your_jwt_secret_key')
jwt = JWTManager(app)
db = SQLAlchemy(app)





class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)    
    password_hash = db.Column(db.String(200), nullable=False)

with app.app_context():
    print("Creating database tables...")
    db.create_all()

@app.route('/me', methods = ['GET'])
@jwt_required()
def me():
    current_user  =  get_jwt_identity()
    return jsonify({'username': current_user}), 200

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json(force=True, silent=True)
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Missing username or password'}), 400
    
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'User already exists'}), 409

    hashed_pw = generate_password_hash(password)
    user = User(username=username, password_hash=hashed_pw)
    try:
        db.session.add(user)
        db.session.commit()
        return jsonify({'message': 'User registered'}), 201
    except Exception as e:
        db.session.rollback() # Rollback the session in case of error
        return jsonify({'error': "Server error", 'detail': str(e)}), 500


@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json(force=True, silent=True)
        username = data.get("username", "").strip()
        password = data.get("password", "")

        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400

        user = User.query.filter_by(username=username).first()
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        access_token = create_access_token(identity=username)
        return jsonify({'message': 'Login successful','token':access_token}), 200
    except Exception as e:
        return jsonify({'error': 'Server error', 'detail': str(e)}), 500



# @app.errorhandler(500)
# def internal_server_error(e):

#     return jsonify({'error': 'Server error', 'detail': str(e)}), 500





if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)