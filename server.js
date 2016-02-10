const koa = require('koa');
const route = require('koa-route');
const app = module.exports = koa();

// APIs
const aaltoApi = require('./apis/oodi-aalto');


// Routes
app.use(route.get('/a/course/:coursecode/', aaltoApi.getCourse));


app.listen(8081);
console.log('App listening on port 8081');
