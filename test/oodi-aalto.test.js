const app = require('./server');
const request = require('supertest').agent(app.listen());
const errorTypes = require('./errorTypes');

describe('404', function(){
  describe('when GET /', function(){
    it('should return the 404 page', function(done){
      request
      .get('/a/course/RAND-COURSECODE')
      .expect(404)
      .expect(/Page Not Found/, done);
    })
  })
})
