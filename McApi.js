import { Promise } from 'bluebird';

const webdriverio = require('webdriverio');
const testConfig = require('./test-config');
const _ = require('underscore');
const loginUrl = 'http://mycourses.aalto.fi/login/index.php';
const searchUrl = 'http://mycourses.aalto.fi/course/search.php?search=';

const options = {
  desiredCapabilities: {
    browserName: 'chrome',
  }
};

const client = webdriverio.remote(options);

export class MCApi {
  constructor() {
    this.singleCourseData = {};
  }

  getEventsByCourseCode(courseCode) {
    return new Promise((resolve, reject) => {

      this.singleCourseData[courseCode] = {
        course: {},
        events: [],
      };

      const url = searchUrl + courseCode;
      const dataToParse = [];

      client
        .init()
        .url(url)
        .click('.highlight=' + courseCode)

        // Course name
        .getText('#page-header a h1', (err, res) => {
          const parts = this._parseCourseName(res);

          this.singleCourseData[courseCode].course.start = parts.start;
          this.singleCourseData[courseCode].course.end = parts.end;
          this.singleCourseData[courseCode].course.name = parts.name;
          this.singleCourseData[courseCode].course.code = parts.code;
        })

        // Lecture info
        .getText('.block_calendar_upcoming .content .event > a', (err, res) => {
          dataToParse.push(res);
        })

        // Lecture times
        .getText('.block_calendar_upcoming .event .date', (err, res) => {
          dataToParse.push(res);
        })

        .then(() => {
          this.singleCourseData[courseCode].events = this._parseEventData(
            _.unzip(dataToParse)
          );
        })

        .end()

        .then(() => {
          resolve(this.singleCourseData[courseCode]);
        });

      client.on('error', (e) => {
        // will be executed everytime an error occured
        // e.g. when element couldn't be found
        console.log(e.body.value.class);   // -> "org.openqa.selenium.NoSuchElementException"
        console.log(e.body.value.message); // -> "no such element ..."
        reject(e);
      });
    });
  }

  getUserCourseInfo(userInfo) {
    const dataToParse = [];

    client
      .init()
      .url(loginUrl)
      .click('.greenloginbtn=Aalto login')
      .setValue('#username', testConfig.username)
      .setValue('#password', testConfig.password)
      .click('button[type="submit"]')

      // Course names
      .getText('.block_calendar_upcoming .event .course a', (err, res) => {
        if (err) {
          console.log('error', err);
        }
        dataToParse.push(res);
      })

      // Lecture info
      .getText('.block_calendar_upcoming .event > a', (err, res) => {
        if (err) {
          console.log('error', err);
        }
        dataToParse.push(res);
      })

      // Lecture times
      .getText('.block_calendar_upcoming .event .date', (err, res) => {
        if (err) {
          console.log('error', err);
        }
        dataToParse.push(res);
      })

      .then(() => {
        const combinedData = _.unzip(dataToParse);

        // Parse to JSON
        const data = [];
        combinedData.forEach((dataEntry) => {
          const entry = {
            course: {},
            lecture: {},
          };
          /* Parse course name, code, start / end
           * eg. => 'ME-E4300 - Semantic Web, 13.01.2016-07.04.2016'
           */
          const courseNameParts = dataEntry[0].split(',');
          const courseNameCode = courseNameParts[0];
          const courseNameCodeParts = courseNameCode.split(' - ');
          const courseStartEnd = courseNameParts[1];
          const courseStartEndParts = courseStartEnd.split('-');

          entry.course.start = courseStartEndParts[0];
          entry.course.end = courseStartEndParts[1];
          entry.course.name = courseNameCodeParts[1].trim();
          entry.course.code = courseNameCodeParts[0].trim();

          /* Parse lecture name, class room, building, address
           * eg. => 'Semantic Web Lecture, 2534-2535, TUAS, Otaniementie 17'
           */
          const lectureInfoParts = dataEntry[1].split(',');
          entry.lecture.name = lectureInfoParts[0].trim();
          entry.lecture.room = lectureInfoParts[1].trim();
          entry.lecture.building = lectureInfoParts[2].trim();
          entry.lecture.address = lectureInfoParts[3].trim();

          /* Parse lecture times
           * eg. 'Today, 10:15 AM\n» 12:00 PM'
           */
          const rgx = /(0?[1-9]||1[0-2]):[0-5][0-9] (AM|PM)/g;
          const matches = dataEntry[2].match(rgx);
          entry.lecture.start = matches.length === 2 ? matches[0] : null;
          entry.lecture.end = matches.length === 2 ? matches[1] : null;

          data.push(entry);
        });
      })

      .end();
  }

  _parseCourseName(nameString) {
    const courseNameParts = nameString.split(',');
    const courseNameCode = courseNameParts[0];
    const courseNameCodeParts = courseNameCode.split(' - ');
    const courseStartEnd = courseNameParts[1];
    const courseStartEndParts = courseStartEnd.split('-');

    return {
      start: courseStartEndParts[0].trim(),
      end: courseStartEndParts[1].trim(),
      name: courseNameCodeParts[1].trim(),
      code: courseNameCodeParts[0].trim(),
    }
  }

  _parseEventData(data) {
    const events = [];

    data.forEach((dataEntry) => {
      const schooldEvent = {};

      /* Parse lecture name, class room, building, address
       * eg. => 'Semantic Web Lecture, 2534-2535, TUAS, Otaniementie 17'
       */
      const eventInfoParts = dataEntry[0].split(',');

      if (eventInfoParts.length === 4) {
        // Lecture
        schooldEvent.type = 'lecture';
        schooldEvent.name = eventInfoParts[0].trim();
        schooldEvent.room = eventInfoParts[1].trim();
        schooldEvent.building = eventInfoParts[2].trim();
        schooldEvent.address = eventInfoParts[3].trim();
      } else if (eventInfoParts.length === 1){
        // Assignment
        schooldEvent.type = 'assignment';
        schooldEvent.name = eventInfoParts[0];
      } else {
        // Unknown
        schooldEvent.type = 'unknown';
      }

      /* Parse lecture times
       * eg. 'Today, 10:15 AM\n» 12:00 PM'
       */
      const timeParts = dataEntry[1].split(':');
      if (timeParts.length === 3) {
        // Lecture
        const rgx = /(0?[1-9]||1[0-9]||2[0-4]):[0-5][0-9] ?(AM|PM)?/g;
        const matches = dataEntry[1].match(rgx);

        schooldEvent.start = !!matches ? matches[0] : null;
        schooldEvent.end = !!matches ? matches[1] : null;
      } else if (timeParts.length === 2) {
        // Assignment
        const rgx = /(0?[1-9]||1[0-9]||2[0-4]):[0-5][0-9] ?(AM|PM)?/;
        const matches = dataEntry[1].match(rgx);
        schooldEvent.deadline = !!matches ? matches[0] : null;
      }

      events.push(schooldEvent);
    });

    return events;
  }

}
