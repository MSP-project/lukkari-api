import { Promise } from 'bluebird';
const _ = require('underscore');
const webdriverio = require('webdriverio');
const oodiSearchUrl = 'http://oodi.aalto.fi/a/opintjakstied.jsp'
                    + '?html=1&Kieli=6&Tunniste=';

const options = {
  desiredCapabilities: {
    browserName: 'phantomjs',
  },
};

const client = webdriverio.remote(options);

export class AaltoApi {
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

  _parseLocationData(locations) {
    const mapper = {};
    locations.forEach((l) => {
      const lKey = Object.keys(l)[0] || null;
      if (lKey && l[lKey].length >= 3) {
        const parts = l[lKey][2].split(',');
        const room = l[lKey][1] || null;
        const building = (parts.length >= 2) ? parts[0].trim() : null;
        const address = (parts.length >= 2) ? parts[1].trim() : parts[0];

        mapper[lKey] = {
          room: room,
          building: building,
          address: address,
          abbrev: lKey,
        };
      }
    });

    return mapper;
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

  _parseCourseEvents(data) {
    const courseEvents = [];
    const splittedData = data.split('\n');
    console.log('_parseCourseEvents - splittedData', splittedData);

    /* eslint-disable */
    // eg. "midtermexam" or "exercise"
    const courseEventType = splittedData[1]
    .toLowerCase()
    .replace(/ /g, '')
    .replace(/teacher/g, '')
    .replace(/exercises/g, 'exercise');
    /* eslint-enable */

    console.log('_parseCourseEvents - courseEventType', courseEventType);

    /* eslint-disable */
    const dateRangeRgx = /^\d{2}\.\d{2}\.-\d{2}\.\d{2}\.\d{2}$/;
    const dateSingleRgx = /^\d{2}\.\d{2}\.\d{2}(?! klo)$/;
    const timeRgx = /^(?:mon|tue|wed|thu|fri|sat|sun) \d{2}\.\d{2}-\d{2}\.\d{2}$/;
    /* eslint-enable */

    splittedData.forEach((dataPiece, idx) => {
      // Skip Midterm exam since it is not handled properly yet
      if (courseEventType !== 'midtermexam') {
        let isEvent = true;

        // Init new event
        const courseEvent = {
          type: courseEventType,
        };

        /*
         * Test if event has single or ranged date
         * => eg. "07.01.-11.02.16" or "11.02.16"
         */
        if (!!dataPiece.match(dateRangeRgx)) {
          const parts = dataPiece.split('-');
          courseEvent.startDate = parts[0].slice(0, -1);
          courseEvent.endDate = parts[1];
        } else if (!!dataPiece.match(dateSingleRgx)) {
          courseEvent.startDate = dataPiece;
          courseEvent.endDate = dataPiece;
        } else {
          isEvent = false;
        }

        // Test if event has time => eg. "thu 13.15-15.00"
        if (splittedData.length - 1 >= idx + 1) {
          // The next piece contains the time info
          const nextDataPiece = splittedData[idx + 1].trim();
          console.log('nextDataPiece:', nextDataPiece);

          if (!!nextDataPiece.match(timeRgx)) {
            const day = nextDataPiece.slice(0, 3);
            const parts = nextDataPiece.slice(4).split('-');

            courseEvent.day = day;
            courseEvent.startTime = parts[0];
            courseEvent.endTime = parts[1];
          } else {
            isEvent = false;
          }
        } else {
          isEvent = false;
        }
        if (isEvent) {
          console.log('dataPiece   ===>', dataPiece);
          console.log('courseEvent ===>', courseEvent);
          courseEvents.push(courseEvent);
        }
      }
    });

    return courseEvents;
  }


  _getEventLocation(roomName) {
    return new Promise((resolve, reject) => {
      client
      // .waitForVisible('input[value*="' + roomName + '"]', 5000)
      .click('input[value*="' + roomName + '"]')
      .getText('td.tyyli0', (err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        }
        const location = {};
        location[roomName] = res;
        return location;
      })
      .then((location) => {
        client
        .back()
        .then(() => {
          resolve(location);
        });
      });
    });
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
        console.log('START OF - Getting the course info', res);
        const parts = this._parseCourseName(res[0]);
        this.coursesData[courseCode].course.name = parts.name;
        this.coursesData[courseCode].course.credits = parts.credits;
        this.coursesData[courseCode].course.code = parts.code;
        console.log('END OF - Getting the course info');
        console.log('coursesData is now:', this.coursesData[courseCode]);
        return '*=' + parts.name;
      })
      .then((courseNameLink) => {
        client
        .click(courseNameLink)
        .getText('table.kll', (err, res) => {
          console.log('START OF - Getting the events info', res);
          if (res) {
            const eventInfo = _.isArray(res) ? res : [res];
            eventInfo.forEach((section) => {
              const courseEvents = this._parseCourseEvents(section);

              /* eslint-disable */
              this.coursesData[courseCode].events = this.coursesData[courseCode].events.concat(courseEvents);
              /* eslint-enable */
            });
          }
          console.log('END OF - Getting the events info');
          console.log('coursesData is now:', this.coursesData[courseCode]);
        })
        .getValue('td[width="36%"] input.submit2', (err, res) => {
          console.log('START OF - Getting the location info', res);
          if (res) {
            const allRooms = _.isArray(res) ? res : [res];
            /*
             * Temporarily set location as the room name => easier to attach
             * proper location info later
             */
            this.coursesData[courseCode].events.forEach((evnt, indx) => {
              // Only valid events have location info
              evnt.location = allRooms[indx];
            });

            console.log(
              'coursesData before location details:',
              this.coursesData[courseCode]
            );

            // No need to fetch same room info multiple times
            const uniqRooms = _.uniq(res);

            Promise.map(uniqRooms, (roomName) => {
              return this._getEventLocation(roomName);
            }, {concurrency: 1})
            .then((locations) => {
              const locationMapper = this._parseLocationData(locations);

              this.coursesData[courseCode].events.forEach((courseEvent) => {
                courseEvent.location = locationMapper[courseEvent.location];
              });

              console.log('END OF - Getting the location info');
              console.log('coursesData is now:', this.coursesData[courseCode]);
              return this.coursesData[courseCode];
            })
            .then((data) => {
              // End the the client session
              client
              .end()
              .then(() => {
                resolve(data);
              });
            })
            .catch((error) => {
              console.log('Error getting location info', error);
              client
              .end()
              .then(() => {
                reject(error);
              });
            });
          } else {
            client
            .end()
            .then(() => {
              reject('Something went wrong');
            });
          }
        });
      });


      client.on('error', (e) => {
        // will be executed everytime an error occured
        // e.g. when element couldn't be found
        console.log('Selenium error', e);
        // reject(e);
      });
    });
  }
}
