from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from dotenv import load_dotenv
import psycopg2
import time
import os
import sys
from urllib.parse import quote


time.sleep(15)  # Wait for the database to be ready


env_path = '../frontend-services/.env'
env_path = os.path.join(os.path.dirname(__file__), '..', 'frontend-services', '.env')
load_dotenv(env_path)

app = Flask(__name__)
CORS(app)


DB_USER = 'postgres'
DB_PASSWORD = os.getenv('DB_PASSWORD')  
encoded_password = quote(DB_PASSWORD)

DB_HOST = 'auth-db'       
DB_PORT = '5432'            
DB_NAME = 'authdb'


db_uri = f"postgresql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('SECRET_KEY') 


jwt = JWTManager(app)
db = SQLAlchemy(app)





class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)    
    password_hash = db.Column(db.String(200), nullable=False)



def check_database_exists():
    """Check if the database exists, create it if it doesn't"""
    try:
  
        conn = psycopg2.connect(
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        conn.autocommit = True
        cursor = conn.cursor()
        
     
        cursor.execute(f"SELECT 1 FROM pg_database WHERE datname = '{DB_NAME}'")
        exists = cursor.fetchone()
        
        if not exists:
            print(f"Database '{DB_NAME}' does not exist. Creating it now...")
            cursor.execute(f"CREATE DATABASE {DB_NAME}")
            print(f"Database '{DB_NAME}' created successfully!")
        else:
            print(f"Database '{DB_NAME}' already exists.")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error checking/creating database: {e}")
        return False


def test_database_connection():
    """Test connection to the specific database"""
    try:
       
        conn = psycopg2.connect(
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME
        )
        print("Successfully connected to the database!")
        conn.close()
        return True
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return False


def setup_database():
    """Setup database tables"""
    print("Setting up database tables...")
    with app.app_context():
        try:
            # List tables before creation
            inspector = db.inspect(db.engine)
            existing_tables = inspector.get_table_names()
            print(f"Existing tables before creation: {existing_tables}")
            
        
            db.create_all()
            print("Tables created successfully!")
            
            
            inspector = db.inspect(db.engine)
            new_tables = inspector.get_table_names()
            print(f"Tables after creation: {new_tables}")
            
            return True
        except Exception as e:
            print(f"Error creating database tables: {e}")
            return False


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


@app.route('/check-db', methods=['GET'])
def check_db():
    """Route to check database status"""
    db_exists = check_database_exists()
    db_connection = test_database_connection()
    
    try:
        with app.app_context():
            inspector = db.inspect(db.engine)
            tables = inspector.get_table_names()
            user_count = User.query.count()
    except Exception as e:
        tables = f"Error getting tables: {str(e)}"
        user_count = f"Error getting user count: {str(e)}"
    
    return jsonify({
        'database_exists': db_exists,
        'connection_working': db_connection,
        'tables': tables,
        'user_count': user_count,
        'sqlalchemy_uri': app.config['SQLALCHEMY_DATABASE_URI']
    })
# 





if __name__ == '__main__':
    print(f"Starting auth service with database URI: {db_uri}")

    print(f"Final connection string: {db_uri}")
   
    if not check_database_exists():
        print("Failed to ensure database exists. Exiting.")
        sys.exit(1)
    
    if not test_database_connection():
        print("Failed to connect to database. Exiting.")
        sys.exit(1)
    
    if not setup_database():
        print("Failed to set up database tables. Exiting.")
        sys.exit(1)
    
    print("Database setup complete. Starting Flask server...")
    app.run(host='0.0.0.0', port=5002, debug=True)