/*
////////////////////////////////////////////////////////////////
//  LUKKARI APP
//  Project work for course ICS-E5040 Modern Database Systems
//
//  Teemu Taskula, 294337
//  Ville Toiviainen, 357012
//  Jesse Koivukoski, 349266
//  Antti Partanen, 295967
//
//  Copyright 2016
////////////////////////////////////////////////////////////////
*/


/* ********************************************************************
 * Child process to update course info by scraping the data from oodi
 **********************************************************************  */

const aaltoApi = require('./apis/oodi-aalto');
const monk = require('monk');
const db = monk('localhost/lukkari');
const courses = db.get('courses');

const courseCode = process.argv[2];

console.log(`Executing Child Process - update course ${courseCode}.`);
console.log('==> Find the course to update');
const course = courses.findOne({ 'course.code': courseCode });

if (course) {
  // Check timestamp
  const dayInMillis = 86400000;
  const now = new Date().getTime();
  const updatedLast = course.updated;

  if (now - updatedLast > dayInMillis) {
    console.log(`==> Update course ${courseCode}`);
    aaltoApi.getCourse(courseCode).then((data) => {
      const updatedData = Object.assign({}, data, { updated: now } );

      courses.update({ 'course.code': courseCode }, updatedData, (err) => {
        if (err) console.log('Error updating the course to db', err);
        console.log(`Child Process executed - course ${courseCode} updated.`);
      });
    });
  } else {
    console.log(`==> Course has recently been updated. Dont't update course ${courseCode}`);
    console.log(`Child Process executed - course ${courseCode} not updated.`);
    db.close();
  }
}
