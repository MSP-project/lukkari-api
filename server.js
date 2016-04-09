/* eslint-disable no-use-before-define */

const Koa = require('koa');
const router = require('koa-router')();
const bodyParser = require('koa-bodyparser');
const moment = require('moment');

// Set locale => for finnish weekdays etc.
moment.locale('fi');

// const jwt = require('koa-jwt');

const app = module.exports = new Koa();

// Error handling
const Boom = require('boom');

// APIs
const aaltoApi = require('./apis/oodi-aalto');

// db
const monk = require('monk');
const db = monk('localhost/lukkari');

// Collections
const courses = db.get('courses');

// For parsing request json data
app.use(bodyParser());

// Custom 401 handling if you don't want to expose koa-jwt errors to users
// app.use(function *(next){
//   try {
//     yield next;
//   } catch (err) {
//     if ( err.status === 401) {
//       this.status = 401;
//       this.body = 'Protected resource, use Authorization header to get access';
//     } else {
//       throw err;
//     }
//   }
// });


// Middleware below this line is only reached if JWT token is valid
// TODO: change secret
// app.use(jwt({
//   secret: 'lukkari-secret',
// })
// .unless({ path: [/^\/authenticate/] }));


// Provide some useful info
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

app.use(router.routes());
app.use(router.allowedMethods());


async function getCourse(ctx) {
  const courseCode = ctx.params.coursecode;

  // Check if in db
  console.log(`==> search course from db with code ${courseCode}`);

  const now = moment().utc().toISOString();
  const data = await courses.findOne({
    'course.code': courseCode,
    'course.end': { $gt: now }, // we want only active courses
  });

  if (data) {
    console.log('==> found from db:', data.course);

    ctx.body = data;

    // Update course data in background
    startUpdateCourseWorker(courseCode);

    return;
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
    courses.insert(scrapedData);

    ctx.body = scrapedData;

    return;
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


// function authenticate() {
//   console.log(this.request.body);
//   const { username, password } = this.request.body;
//
//   // const user = yield users.findOne({
//   //   username: username,
//   //   password: password,
//   // });
//
//   const user = true;
//
//   if (user) {
//     console.log(user);
//
//     const token = jwt.sign(
//       {username: 'testi', password: 'testi'},
//       'lukkari-secret',
//     );
//
//     this.status = 200;
//     this.body = {token: token};
//   }
// }


app.listen(8081);
console.log('App listening on port 8081');
