// const _ = require('underscore');
const koa = require('koa');
const route = require('koa-route');
const app = module.exports = koa();

const aalto = require('./controllers/oodi-aalto');
const hy = require('./controllers/oodi-hy');

/*
 * Routes
 */
app.use(route.get('/a/course/:coursecode/', aalto.getCourse));
// app.use(route.get('/hy/course/:coursecode/', hy.getEventsByCourseCode));

app.listen(8081);
console.log('App listening on port 8081');

// import { McApi } from './McApi';
// import { AaltoApi } from './AaltoApi';
// import { HyApi } from './HyApi';

// const express = require('express');

// const app = express();
// const mcApi = new McApi();
// const hyApi = new HyApi();
// const aaltoApi = new AaltoApi();


// app.get('/', (req, res) => {
//   res.send('Hello World');
// });
//
// app.get('/a/course/:coursecode', (req, res) => {
//   console.time('api');
//   aaltoApi.getEventsByCourseCode(req.params.coursecode)
//   .then((data) => {
//     if (_.isObject(data)) {
//       res.json(data);
//     } else {
//       res.send('No data');
//     }
//     console.timeEnd('api');
//   })
//   .catch((error) => {
//     console.log('COURSE API ERROR:', error);
//     res.send(error);
//   });
// });

// app.get('/hy/course/:coursecode', (req, res) => {
//   hyApi.getEventsByCourseCode(req.params.coursecode)
//   .then((data) => {
//     res.send(data);
//   })
//   .catch((error) => {
//     console.log(error);
//     res.send('Error');
//   });
// });

// const server = app.listen(8081, () => {
//   const host = server.address().address;
//   const port = server.address().port;
//
//   console.log('Example app listening at http://%s:%s', host, port);
// });
