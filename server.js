// import { McApi } from './McApi';
import { AaltoApi } from './AaltoApi';
import { HyApi } from './HyApi';

const _ = require('underscore');
const express = require('express');
const app = express();
// const mcApi = new McApi();
const aaltoApi = new AaltoApi();
const hyApi = new HyApi();

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/a/course/:coursecode', (req, res) => {
  aaltoApi.getEventsByCourseCode(req.params.coursecode)
  .then((data) => {
    if (_.isObject(data)) {
      res.json(data);
    } else {
      res.send('No data');
    }
  })
  .catch((error) => {
    console.log(error);
    res.send('Error');
  });
});

app.get('/hy/course/:coursecode', (req, res) => {
  hyApi.getEventsByCourseCode(req.params.coursecode)
  .then((data) => {
    res.send(data);
  })
  .catch((error) => {
    console.log(error);
    res.send('Error');
  });
});

const server = app.listen(8081, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});
