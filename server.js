const koa = require('koa');
const route = require('koa-route');
const bodyParser = require('koa-bodyparser');
const jwt = require('koa-jwt');
const app = module.exports = koa();

const monk = require('monk');
// wrap is used to make monk work with generators
const wrap = require('co-monk');
const db = monk('localhost/lukkari');

const courses = wrap(db.get('courses'));
const events = wrap(db.get('events'));
const users = wrap(db.get('users'));

// eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6InRlc3RpIiwicGFzc3dvcmQiOiJ0ZXN0aSIsImlhdCI6MTQ1NTIyOTUxMH0.4wOd_RMQgZLSyASbIyfGu-RIwMXDxx0UqC1kJKKyODg

// For parsing request json data
app.use(bodyParser());

// Custom 401 handling if you don't want to expose koa-jwt errors to users
app.use(function *(next){
  try {
    yield next;
  } catch (err) {
    if ( err.status === 401) {
      this.status = 401;
      this.body = 'Protected resource, use Authorization header to get access';
    } else {
      throw err;
    }
  }
});


// Middleware below this line is only reached if JWT token is valid
// TODO: change secret
app.use(jwt({
  secret: 'lukkari-secret',
})
.unless({ path: [/^\/authenticate/] }));


// APIs
const aaltoApi = require('./apis/oodi-aalto');

// Routes
app.use(route.post('/authenticate', authenticate));
app.use(route.get('/course/:coursecode', getCourse));

function *authenticate() {
  console.log(this.request.body);
  const { username, password } = this.request.body;

  // const user = yield users.findOne({
  //   username: username,
  //   password: password,
  // });

  const user = true;

  if (user) {
    console.log(user);

    const token = jwt.sign(
      {username: 'testi', password: 'testi'},
      'lukkari-secret',
    );

    this.status = 200;
    this.body = {token: token};
  }
}


function *getCourse(courseCode) {
  // Check if in db
  const data = yield courses.find({ 'course.code': courseCode });

  if (data) {
    return data;

    // TODO: start update daemon
  }
  const scrapedData = yield aaltoApi.getCourse;

  // Add to db

  courses.insert(scrapedData);

  return scrapedData;
}


app.listen(8081);
console.log('App listening on port 8081');
