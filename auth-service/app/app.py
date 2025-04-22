from flask import Flask, render_template, url_for, redirect, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, login_user, login_required, logout_user, LoginManager, current_user
from flask_wtf import FlaskForm
from flask_wtf.csrf import CSRFProtect
from wtforms  import StringField, PasswordField, SubmitField
from wtforms.validators import input_required, Length, ValidationError
from flask_bcrypt import Bcrypt




app = Flask(__name__)
# app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///instance/database.db'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{app.instance_path}/database.db'
app.config['SECRET_KEY'] = 'secretkey'
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)


login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))



class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username  = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(80), nullable=False)

class RegistrationForm(FlaskForm):
    username = StringField('Username', validators=[input_required(), Length(min =2, max=20)], 
                           render_kw={"placeholder": "Username"})
    password = PasswordField('Password', validators=[input_required(),Length(min=6, max=20)],
                             render_kw={"placeholder":"Password"})
    submit = SubmitField('Sign Up')


    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('Username already exists!, please choose a different one')
        

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[input_required(), Length(min =2, max =20)], render_kw={"placeholder": "Username"})
    password = PasswordField('Password', validators=[input_required(),Length(min=6, max  = 20)],render_kw={"placeholder":"Password"})
    submit = SubmitField('Login')
        
@app.route('/')
def index():
    return render_template('home.html')

@app.route('/dashboard', methods = ['GET', 'POST'])
@login_required
def dashboard():
    form =LoginForm()
    return render_template('dashboard.html')

@app.route('/login', methods = ['GET', 'POST'])
def login():
    form  = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username =form.username.data).first()
        if user:
            if bcrypt.check_password_hash(user.password, form.password.data):
                login_user(user)
                return redirect(url_for('dashboard'))
            else:
                return 'Invalid_password'
        else:
            return 'user not found'
    return render_template('login.html',form=form)

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/register', methods = ['GET', 'POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        hashed_password = bcrypt.generate_password_hash(form.password.data)
        new_user = User(username = form.username.data, password = hashed_password)
        db.session.add(new_user)
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html',form=form)



with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)
