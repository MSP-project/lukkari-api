import { Promise } from 'bluebird';

const _ = require('underscore');
const webdriverio = require('webdriverio');
const oodiSearchUrl = 'http://weboodi.helsinki.fi/hy/opintjakstied.jsp'
                    + '?html=1&Kieli=6&Tunniste=';

const options = {
  desiredCapabilities: {
    browserName: 'phantomjs',
  },
};

const client = webdriverio.remote(options);

// NOTE: only if we have time to implement this!!!

export class HyApi {
  constructor() {
    this.coursesData = {};
  }

  _removeFromArray(arr, what) {
    let found = arr.indexOf(what);

    while (found !== -1) {
      arr.splice(found, 1);
      found = arr.indexOf(what);
    }
  }

  // eg. 'ME-E4300 Semantic Web, 5 cr'
  _parseCourseName(cnameData) {
    const parts = cnameData.split(',');
    const credits = parts.pop().trim();
    const parts2 = parts[0].split(' ');
    const code = parts2.shift();
    const name = parts2.join(' ').trim();

    return {
      code: code,
      name: name,
      credits: credits,
    };
  }

  _parseEvents(data, courseCode) {
    const splittedData = data.split('\n');
    // eg. "Midterm exam" or "Exercises"
    const courseEventLabel = splittedData[1].split(' ')[0].trim();
    // eg. "midtermexam" or "exercises"
    const courseEventType = courseEventLabel.toLowerCase().replace(/ /g, '');

    const dateRgx = /^((0[0-9]|1[0-9]|2[0-4])\.(0[0-9]|1[0-9]|2[0-4])\.-)/;
    const timeRgx = /^(mon|tue|wed|thu|fri|sat|sun)/;
    splittedData.forEach((dataPiece, idx) => {
      let hasTime = false;
      let hasDate = false;

      // Init new event
      const courseEvent = {
        type: courseEventType,
      };

      // Test if event has date => eg. "07.01.-11.02.16"
      if (!!dataPiece.match(dateRgx)) {
        const parts = dataPiece.split('-');

        courseEvent.startDate = parts[0].slice(0, -1);
        courseEvent.endDate = parts[1];

        hasDate = true;
      }

      if (hasDate) {
        // Test if event has time => eg. "thu 13.15-15.00"
        if (splittedData.length - 1 >= idx + 1) {
          // The next piece contains the time info
          const nextDataPiece = splittedData[idx + 1].trim();

          if (!!nextDataPiece.match(timeRgx)) {
            const parts = nextDataPiece.slice(4).split('-');

            courseEvent.startTime = parts[0];
            courseEvent.endTime = parts[1];

            hasTime = true;
          }
        }
      }

      // Only push event if it has both date and time
      if (hasTime && hasDate) {
        this.coursesData[courseCode].events.push(courseEvent);
      }
    });
  }

  _addLocationToEvents() {
    console.log('moi');
  }

  getEventsByCourseCode(courseCode) {
    return new Promise((resolve, reject) => {

      if (!this.coursesData[courseCode]) {
        this.coursesData[courseCode] = {
          course: {},
          events: [],
        };
      }

      const url = oodiSearchUrl + courseCode;

      client
      .init()
      .url(url)
      .getText('.tauluotsikko', (err, res) => {
        const parts = this._parseCourseName(res[0]);
        this.coursesData[courseCode].course.name = parts.name;
        this.coursesData[courseCode].course.credits = parts.credits;
        this.coursesData[courseCode].course.code = parts.code;
        return '*=' + parts.name;
      })
      .then((courseNameLink) => {
        client
        .click(courseNameLink)
        // .getText('table.kll th[width="32%"]', (err, res) => {
        //   // Remove occurances of 'Teacher'
        //   this._removeFromArray(res, 'Teacher');
        // })
        .getText('table.kll', (err, res) => {
          if (res) {
            res.forEach((section) => {
              this._parseEvents(section, courseCode);
            });
          }
          console.log('UUUH BABE', this.coursesData[courseCode]);
        })
        // .getText('td[width="36%"]', (err, res) => {
        //   const courseTimes = res.shift();
        //   const eventInfo = _.zip(sectionsLabels, res);
        //   console.log('courseTimes', courseTimes);
        //   console.log('eventInfo', eventInfo);
        // })
        // .getValue('td[width="36%"] input.submit2', (err, res) => {
        //   console.log('Lecture location Stuff:', res);
        // })

        .end()

        .then(() => {
          resolve('Done');
        });
      });


      client.on('error', (e) => {
        // will be executed everytime an error occured
        // e.g. when element couldn't be found
        console.log('ERRRRR', e);
        // reject(e);
      });
    });
  }
}
