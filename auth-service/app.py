# from flask import Flask, render_template, url_for, redirect, request
# from flask_sqlalchemy import SQLAlchemy
# from flask_login import UserMixin, login_user, login_required, logout_user, LoginManager, current_user
# from flask_wtf import FlaskForm
# from flask_wtf.csrf import CSRFProtect
# from wtforms  import StringField, PasswordField, SubmitField
# from wtforms.validators import input_required, Length, ValidationError
# from flask_bcrypt import Bcrypt
# import os
# import time

# time.sleep(10)  # Wait for the database to be ready




# app = Flask(__name__)
# # app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///instance/database.db'
# # app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{app.instance_path}/database.db'
# app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://postgres:Zompire%4017@localhost:5432/authdb')
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# app.config['SECRET_KEY'] = 'secretkey'
# db = SQLAlchemy(app)
# bcrypt = Bcrypt(app)


# login_manager = LoginManager()
# login_manager.init_app(app)
# login_manager.login_view = 'login'


# @login_manager.user_loader
# def load_user(user_id):
#     return User.query.get(int(user_id))



# class User(db.Model, UserMixin):
#     id = db.Column(db.Integer, primary_key=True)
#     username  = db.Column(db.String(20), unique=True, nullable=False)
#     password = db.Column(db.String(200), nullable=False)

# class RegistrationForm(FlaskForm):
#     username = StringField('Username', validators=[input_required(), Length(min =2, max=20)], 
#                            render_kw={"placeholder": "Username"})
#     password = PasswordField('Password', validators=[input_required(),Length(min=6, max=80)],
#                              render_kw={"placeholder":"Password"})
#     submit = SubmitField('Sign Up')


#     def validate_username(self, username):
#         user = User.query.filter_by(username=username.data).first()
#         if user:
#             raise ValidationError('Username already exists!, please choose a different one')
        

# class LoginForm(FlaskForm):
#     username = StringField('Username', validators=[input_required(), Length(min =2, max =20)], render_kw={"placeholder": "Username"})
#     password = PasswordField('Password', validators=[input_required(),Length(min=6, max  = 20)],render_kw={"placeholder":"Password"})
#     submit = SubmitField('Login')
        
# # @app.route('/')
# # def index():
# #     return render_template('home.html')

# # @app.route('/dashboard', methods = ['GET', 'POST'])
# # @login_required
# # def dashboard():
# #     form =LoginForm()
# #     return render_template('dashboard.html')

# @app.route('/login', methods = ['GET', 'POST'])
# def login():
#     form  = LoginForm()
#     if form.validate_on_submit():
#         user = User.query.filter_by(username =form.username.data).first()
#         if user:
#             if bcrypt.check_password_hash(user.password, form.password.data):
#                 login_user(user)
#                 return redirect(url_for('dashboard'))
#             else:
#                 return 'Invalid_password'
#         else:
#             return 'user not found'
#     return render_template('login.html',form=form)

# @app.route('/logout')
# def logout():
#     logout_user()
#     return redirect(url_for('login'))

# @app.route('/register', methods = ['GET', 'POST'])
# def register():
#     form = RegistrationForm()
#     if form.validate_on_submit():
#         hashed_password = bcrypt.generate_password_hash(form.password.data).decode('utf-8')
#         new_user = User(username = form.username.data, password = hashed_password)
#         db.session.add(new_user)
#         db.session.commit()
#         return redirect(url_for('login'))
#     return render_template('register.html',form=form)


# with app.app_context(): 
#     db.create_all()

# if __name__ == '__main__':
#     app.run(debug=False,host="0.0.0.0", port=5002)

from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
import time
import os

time.sleep(10)  # Wait for the database to be ready

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://user:Zompire%40@db:5432/authdb')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)



class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)

with app.app_context():
    print("Creating database tables...")
    db.create_all()

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json(force=True, silent=True)
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'User already exists'}), 409

    hashed_pw = generate_password_hash(password)
    user = User(username=username, password_hash=hashed_pw)
    db.session.add(user)
    db.session.commit()
    return jsonify({'message': 'User registered'}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json(force=True, silent=True)
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid credentials'}), 401

    return jsonify({'message': 'Login successful'}), 200

@app.errorhandler(500)
def internal_server_error(e):
    return jsonify({'error': 'Server error', 'detail': str(e)}), 500





if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)