/* eslint-disable no-use-before-define */

import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import jwt from 'koa-jwt';
import moment from 'moment';
import config from './config';
import koaRouter from 'koa-router';

// Set locale => for finnish weekdays etc.
moment.locale('fi');

// Error handling
import Boom from 'boom';
import errorTypes from './errorTypes';

// APIs
import aaltoApi from './apis/oodi-aalto';

// DB
import monk from 'monk';
const db = monk('localhost/lukkari');

// Collections
const courses = db.get('courses');
const users = db.get('users');

// Make sure that usernames are unique
users.index('username', { unique: true });

const app = new Koa();
const router = koaRouter();

// For parsing request json data
app.use(bodyParser());

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
    console.log('Propagated error catched', err);

    if (err.isBoom) {
      ctx.status = err.output.statusCode;
      ctx.body = err.output.payload;
      ctx.app.emit('error', err, ctx);
    } else if (err.status === 401) {
      const error = Boom.wrap(err, 403, 'Unauthorized');
      ctx.status = error.output.statusCode;
      ctx.body = error.output.payload;
      ctx.app.emit('error', error, ctx);  // Output error
    } else {
      const error = Boom.wrap(err, 500, 'Internal Server Error');
      ctx.status = error.output.statusCode;
      ctx.body = error.output.payload;
      ctx.app.emit('error', error, ctx);  // Output error
    }
  }
});


// Routes
router.get('/course/:coursecode', getCourse);

router.post('/login', loginUser);
router.post('/register', registerUser);

router.get('/user/:uid/courses', getUserCourses);
router.delete('/user/:uid', deleteUser);

router.post('/user/:uid/courses/:coursecode', addUserCourse);
router.delete('/user/:uid/courses/:coursecode', deleteUserCourse);
// router.get('/user/:uid/courses/:coursecode', getUserCourse);


/* *********************************************************************
 * Middleware below this line is only reached if JWT token is valid
 *********************************************************************** */
app.use(jwt({ secret: config.appSecret })
   .unless({ path: [/^\/(login|register|course)/] }));


app.use(router.routes());
app.use(router.allowedMethods());


/* ****************************************************
 * Helper method for getting a course by course code
 ****************************************************** */
async function _getCourseByCode(courseCode) {
  // Check if in db
  console.log(`==> search course from db with code ${courseCode}`);

  const now = moment().utc().toISOString();
  const data = await courses.findOne({
    'course.code': courseCode,
    'course.end': { $gt: now }, // we want only active courses
  });

  //const data = null;

  if (data) {
    console.log('==> found from db:', data.course);

    // Update course data in background
    // TODO fix the func => see comment in there
    startUpdateCourseWorker(courseCode);

    return data;
  }

  console.log('==> course not found in db -> scrape from Oodi');

  try {
    // const scrapedData = await aaltoApi.getCourse(courseCode);
    const scrapedData = await aaltoApi.getCourseNew(courseCode);

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


/* **********************
 * Exposed API methods
 ************************ */
async function getCourse(ctx) {
  try {
    const courseCode = ctx.params.coursecode;
    const course = await _getCourseByCode(courseCode);
    ctx.body = course;
  } catch (e) {
    if (e.isBoom) throw e;
    else {
      console.log(e);
      throw Boom.badImplementation(errorTypes.INVALID_DATA);
    }
  }
}

async function getUserCourses(ctx) {
  // TODO: error handling
  const { uid } = ctx.params;

  console.log(`Get users ${uid} all courses.`);

  const user = await users.findOne({ '_id': users.id(uid) });

  if (!user) throw Boom.badData(errorTypes.USER_NOT_FOUND);

  if (user.courses) {
    ctx.body = user.courses;
  } else {
    ctx.body = [];
  }
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

  let data;
  try {
    data = await _getCourseByCode(coursecode);
  } catch (e) {
    if (e.isBoom) throw e;
    throw Boom.badRequest(errorTypes.INVALID_COURSE_CODE);
  }


  try {
    const res = await users.findAndModify(
      { _id: uid },
      { $addToSet: { courses: coursecode }, // Adds only if not found
    });

    if (!res) {
      throw Boom.badRequest(errorTypes.USER_NOT_FOUND);
    }

    ctx.body = data;
  } catch (e) {
    if (e.isBoom) throw e;
    else throw Boom.badData(errorTypes.INVALID_DATA);
  }
}


async function deleteUserCourse(ctx) {
  // TODO: implement
  const { uid, coursecode } = ctx.params;
  console.log(`Delete user's ${uid} course ${coursecode}`);

  try {
    users.findAndModify(
      { _id: uid },
      { $pull: { courses: coursecode },
    });

    ctx.status = 204;
  } catch (e) {
    throw Boom.badData(errorTypes.USER_COURSE_NOT_REMOVED);
  }
}


async function deleteUser(ctx) {
  // TODO: add session stuff
  const { uid } = ctx.params;

  console.log(`Deleting user ${uid}`);
  try {
    const res = await users.remove({ '_id': users.id(uid) });
    console.log(`Deleted successfully: ${!!res}`);
    ctx.status = 204;
  } catch (e) {
    throw Boom.badData(errorTypes.USER_NOT_DELETED);
  }
}


async function registerUser(ctx) {
  const { username, password } = ctx.request.body;

  // console.log(`Add new user - username: ${username}, password: ${password}`);

  let user;
  try {
    user = await users.insert({ username, password });
  } catch (e) {
    if (e.name === 'MongoError' && e.code === 11000) {
      console.log(';;;;;;>', errorTypes.USER_ALREADY_EXISTS);
      throw Boom.badRequest(errorTypes.USER_ALREADY_EXISTS);
    }
  }

  if (user) {
    const token = jwt.sign(user, config.appSecret, {
      expiresIn: 220000000, // expires in about 7 years
    });

    delete user.password;   // Don't return user's password

    ctx.body = { token, user };
  } else throw Boom.badImplementation(errorTypes.USER_NOT_ADDED);
}


async function loginUser(ctx) {
  const { username, password } = ctx.request.body;

  console.log(`Trying to login user ${username}.`);

  const user = await users.findOne({ username });

  if (!user) {
    throw Boom.badData(errorTypes.USER_NOT_FOUND);
  }

  // Check password
  if (user.password !== password) {
    throw Boom.badData(errorTypes.PASSWORD_NO_MATCH);
  }

  const token = jwt.sign(user, config.appSecret, {
    expiresIn: 220000000, // expires in about 7 years
  });

  delete user.password;   // Don't return user's password

  ctx.body = { token, user};
}


/* *********************************************************
 * A background process that updates course by course code
 *********************************************************** */

/* eslint-disable camelcase */
const child_process = require('child_process');
/* eslint-enable camelcase */

function startUpdateCourseWorker(courseCode) {
  const worker = child_process.spawn(
    'node',
    ['./updateCourse.js', courseCode]
  );

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


// Start the server
app.listen(8082);
console.log('App listening on port 8082');
