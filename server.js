/* eslint-disable no-use-before-define */

const Koa = require('koa');
const router = require('koa-router')();
const bodyParser = require('koa-bodyparser');
const moment = require('moment');
// const jwt = require('koa-jwt');

// Set locale => for finnish weekdays etc.
moment.locale('fi');

// Error handling
const Boom = require('boom');

// APIs
const aaltoApi = require('./apis/oodi-aalto');

// db
const monk = require('monk');
const db = monk('localhost/lukkari');

// Collections
const courses = db.get('courses');
const users = db.get('users');

const app = module.exports = new Koa();


// sessions
const convert = require('koa-convert'); // convert Koa 1.0 generators to async
const session = require('koa-generic-session');
const MongoStore = require('koa-generic-session-mongo');

app.keys = ['lukkari-secret-session-key', 'another-lukkari-secret-session-key'];
app.use(convert(session({
  store: new MongoStore(),  // TODO we migth need mongoose for this...
})));

// For parsing request json data
app.use(bodyParser());

// authentication
require('./auth');
const passport = require('koa-passport');
app.use(passport.initialize());
app.use(passport.session());


// Provide some performance info
app.use(async (ctx, next) => {
  const start = new Date;
  await next();
  const ms = new Date - start;
  console.log(`Req time: ${ctx.method} ${ctx.url} - ${ms}ms`);
});


// Middleware that catches errors which propagated all the way to the top.
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err.isBoom) {
      ctx.status = err.output.statusCode;
      ctx.body = err.output.payload;
      ctx.app.emit('error', err, ctx);
    } else {
      // Wrap error into a Boom error, if necessary
      const error = Boom.wrap(err, 500, 'Internal Server Error');
      // Output error
      ctx.status = error.output.statusCode;
      ctx.body = error.output.payload;
      ctx.app.emit('error', error, ctx);
    }
  }
});


// Routes
router.get('/course/:coursecode', getCourse);

router.get('/login', loginUser);
router.post('/register', registerUser);

router.get('/user/:uid/courses', getUserCourses);
router.delete('/user/:uid', deleteUser);

// router.get('/user/:uid/courses/:coursecode', getUserCourse);
router.post('/user/:uid/courses/:coursecode', addUserCourse);
router.delete('/user/:uid/courses/:coursecode', deleteUserCourse);

app.use(router.routes());
app.use(router.allowedMethods());


async function _getCourseByCode(courseCode) {
  // Check if in db
  console.log(`==> search course from db with code ${courseCode}`);

  const now = moment().utc().toISOString();
  const data = await courses.findOne({
    'course.code': courseCode,
    'course.end': { $gt: now }, // we want only active courses
  });

  if (data) {
    console.log('==> found from db:', data.course);

    // Update course data in background
    startUpdateCourseWorker(courseCode);

    return data;
  }

  console.log('==> course not found in db -> scrape from Oodi');

  try {
    const scrapedData = await aaltoApi.getCourse(courseCode);

    console.log('==> scraped the data from oodi:', scrapedData.course);

    // Delete out-dated course data
    courses.remove({ 'course.code': courseCode }, (err) => {
      if (err) throw err;
    });

    /* NOTE: scrapedData can be out-dated if the course has just ended
     * TODO: do we want to check the end date also here?
     * is it ok to return out-dated / irrelevant data?
     */
    // Add to db
    const newCourse = await courses.insert(scrapedData);

    return newCourse;
  } catch (e) {
    console.log(e);

    if (e.isBoom) {
      throw e;  // just re-throw the error
    } else {
      console.log(e);
      throw Boom.badImplementation('Error in scraping data');
    }
  }
}


async function getCourse(ctx) {
  try {
    const courseCode = ctx.params.coursecode;
    const course = await _getCourseByCode(courseCode);
    ctx.body = course;
  } catch (e) {
    if (e.isBoom) throw e;
    else {
      console.log(e);
      throw Boom.badImplementation('Could not get the requested course');
    }
  }
}

async function getUserCourses(ctx) {
  // TODO: error handling
  const { uid } = ctx.params;

  console.log(`Get users ${uid} all courses.`);

  const user = users.findOne({ '_id': users.id(uid) });

  ctx.body = user.courses;
}

// TODO: is this required? if so implement
// async function getUserCourse(ctx) {
//   // TODO: error handling
//   const { uid, coursecode } = ctx.params;
//   console.log(`Get users ${uid} course ${coursecode}`);
//
//   const user = users.findOne({
//     '_id': users.id(uid),
//     'course.coursecode': coursecode,
//   });
//   const course = user.courses[coursecode];
//
//   console.log(`Requested course: ${course}`);
//
//   ctx.body = course;
// }


async function addUserCourse(ctx) {
  // TODO: error handling
  const { uid, coursecode } = ctx.params;
  console.log(`Add new course ${coursecode} for user ${uid}`);

  const data = await _getCourseByCode(coursecode);

  users.findAndModify(
    { _id: uid },
    { $push: { courses: coursecode },
  });

  ctx.body = data;
}


async function deleteUserCourse(ctx) {
  // TODO: implement
  const { uid, coursecode } = ctx.params;
  console.log(`Delete user's ${uid} course ${coursecode}`);

  users.findAndModify(
    { _id: uid },
    { $pull: { courses: coursecode },
  });

  ctx.status = 204;
}


async function registerUser(ctx) {
  // TODO: add session stuff
  const { username, password } = ctx.request.body;

  console.log(`Add new user - username: ${username}, password: ${password}`);

  const newUser = await users.insert({ username, password });

  console.log(newUser);

  ctx.body = newUser._id;
}


async function deleteUser(ctx) {
  // TODO: add session stuff
  const { uid } = ctx.params;

  console.log(`Delete user ${uid}`);

  const res = await users.remove({ '_id': users.id(uid) });

  console.log(`Deleted successfully: ${!!res}`);

  ctx.status = 204;
}


async function loginUser(ctx) {
  // TODO: implement
  const { uid } = ctx.params;
  console.log(`Login user with uid: ${uid}`);
}


// passport.authenticate('local'),
//   (req, res) => {
//     // If this function gets called, authentication was successful.
//     // `req.user` contains the authenticated user.
//     res.redirect('/users/' + req.user.username);
//   });


/* eslint-disable camelcase */
const child_process = require('child_process');
/* eslint-enable camelcase */

function startUpdateCourseWorker(courseCode) {
  const worker = child_process.spawn('node', ['updateCourse.js', courseCode]);

  worker.stdout.on('data', (data) => {
    console.log('Worker stdout: ' + data);
  });

  worker.stderr.on('data', (data) => {
    console.log('Worker stderr: ' + data);
  });

  worker.on('close', (code) => {
    console.log('Worker exited with code ' + code);
  });
}


app.listen(8081);
console.log('App listening on port 8081');
