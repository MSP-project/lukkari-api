require('babel-core/register'); // to compile from ES6 -> ES5

/* ********************************************************************
 * Child process to update course info by scraping the data from oodi
 **********************************************************************  */

const aaltoApi = require('./apis/oodi-aalto');
const monk = require('monk');
const db = monk('localhost/lukkari');
const courses = db.get('courses');

const courseCode = process.argv[2];

console.log(`Executing Child Process - update course ${courseCode}.`);

aaltoApi.getCourseNew(courseCode).then((data) => {
  // console.log('Child Process - scraped data:', data);
  courses.findAndModify({
    query: { 'course.code': courseCode },
    update: data,
  }, (err) => {
    if (err) console.log('Error updating the course to db', err);
    console.log(`Child Process executed - course ${courseCode} updated.`);
  });
});
