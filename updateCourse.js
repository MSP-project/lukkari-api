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

aaltoApi.getCourse(courseCode).then((data) => {
  courses.findAndModify({
    query: { 'course.code': courseCode },
    update: data,
  }, (err) => {
    if (err) console.log('Error updating the course to db', err);
    console.log(`Child Process executed - course ${courseCode} updated.`);
  });
});
