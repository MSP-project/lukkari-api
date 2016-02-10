import { Promise } from 'bluebird';

const _ = require('underscore');
const moment = require('moment');
const webdriverio = require('webdriverio');
const locationMapper = require('../locations');
const weekdaysMapper = require('../weekdays');
const errorTypes = require('../errorTypes');
const oodiSearchUrl = 'http://oodi.aalto.fi/a/opintjakstied.jsp?' +
                      'html=1&Kieli=6&Tunniste=';

const options = {
  desiredCapabilities: {
    browserName: 'phantomjs',
  },
};

// Exposed methods
module.exports.getCourse = getCourse;

function * getCourse(courseCode) {
  const client = webdriverio.remote(options);
  const url = oodiSearchUrl + courseCode;
  const data = {};

  /*
   * 1) Open course's oodi page and scrape the table titles
   */
  const tableTitles = yield client.init().url(url).getText('.tauluotsikko');

  // first title is eg. ME-E4300 Semantic Web, 5 cr
  const courseData = _parseCourseName(tableTitles[0]);

  if (!courseData) {
    console.log('COURSE NOT FOUND');
    this.status = 404;
    this.body = {
      message: errorTypes.ERROR_COURSE_NOT_FOUND,
    };
    return;
  }

  // Add course info to data
  data.course = courseData;

  /*
   * 2) Open course's detail oodi page and scrape the events data
   */
  const nextPageLink = '*=' + courseData.name;
  let eventsData = yield client.click(nextPageLink).getText('table.kll');
  let locationsData = yield client.getValue('td[width="36%"] input.submit2');

  /*
   * NOTE: if event does not have a location specified => it is impossible to
   * attach the location info correctly to an event since eventsData and
   * locationsData need to have same length (indexes match)
   */

  if (!eventsData) {
    console.log('COURSE EVENTS NOT FOUND');
    this.status = 404;
    this.body = {
      message: errorTypes.ERROR_COURSE_EVENTS_NOT_FOUND,
    };
    return;
  }

  if (!locationsData) {
    console.log('COURSE EVENTS LOCATIONS NOT FOUND');
    this.status = 404;
    this.body = {
      message: errorTypes.ERROR_COURSE_EVENTS_LOCATION_NOT_FOUND,
    };
    return;
  }

  // Events and locations data needs to be an array for the parser
  eventsData = _.isArray(eventsData) ? eventsData : [eventsData];
  locationsData = _.isArray(locationsData) ? locationsData : [locationsData];

  const courseEvents = _parseCourseEvents(eventsData, locationsData);

  if (!courseEvents) {
    console.log('UNABLE TO PARSE COURSE EVENTS/LOCATIONS');
    this.status = 404;
    this.body = {
      message: errorTypes.ERROR_COURSE_EVENTS_NOT_PARSED,
    };
    return;
  }

  // Add courses events info to data
  data.events = courseEvents;

  this.body = data;
}


// Own methods
function _parseCourseName(courseInfo) {
  const parts = courseInfo.split(',');

  if (parts.length === 1) {
    return null;
  }

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

function _createSubEvents(ddmmyyStart, ddmmyyEnd) {
  const subEvents = [];
  const start = moment(ddmmyyStart, 'DDMMYY');
  const end = moment(ddmmyyEnd, 'DDMMYY');

  while (start.add(7, 'days').isBefore(end)) {
    subEvents.push(
      {
        id: null,
        date: start.format('MM-DD-YYYY'),
      }
    );
  }
  return subEvents;
}

// TODO: refactor/clean this function
function _parseCourseEvents(eventSections, locationList) {
  const courseEvents = [];

  eventSections.forEach((eventSection) => {
    const splittedData = eventSection.split('\n');

    // eg. "midtermexam" or "exercise"
    const courseEventType = splittedData[1]
    .toLowerCase()
    .replace(/ /g, '')
    .replace(/teacher/g, '')
    .replace(/exercises/g, 'exercise');

    const dateRangeRgx = /^\d{2}\.\d{2}\.-\d{2}\.\d{2}\.\d{2}$/;
    const dateSingleRgx = /^\d{2}\.\d{2}\.\d{2}(?! klo)$/;
    /* eslint-disable */
    const timeRgx = /^(?:mon|tue|wed|thu|fri|sat|sun) \d{2}\.\d{2}-\d{2}\.\d{2}$/;
    /* eslint-enable */

    splittedData.forEach((dataPiece, idx) => {
      let isEvent = true;

      // Init new event
      const courseEvent = {
        type: courseEventType,
      };

      /*
       * Test if event has single or ranged date
       * => eg. "07.01.-11.02.16" or "11.02.16"
       */

      // TODO: create subEvents!!!
      // TODO: add label for event
      courseEvent.subEvents = [];
      if (!!dataPiece.match(dateRangeRgx)) {
        const parts = dataPiece.split('-');
        const ddmmyyEnd = parts[1];
        const ddmmyyStartParts = parts[0].split('.');
        const ddmmyyEndParts = parts[1].split('.');

        const ddmmyyStart = !!ddmmyyStartParts[2]
          ? ddmmyyStartParts.join('.')
          : ddmmyyStartParts.join('.') + ddmmyyEndParts[2];

        const subEvents = _createSubEvents(ddmmyyStart, ddmmyyEnd);
        courseEvent.subEvents = subEvents;
      } else if (!!dataPiece.match(dateSingleRgx)) {
        courseEvent.subEvents.push(
          {
            id: null,
            date: dataPiece,
          }
        );
        // courseEvent.startDate = dataPiece;
        // courseEvent.endDate = dataPiece;
      } else {
        isEvent = false;
      }

      // Test if event has time => eg. "thu 13.15-15.00"
      if (isEvent && splittedData.length - 1 >= idx + 1) {
        if (courseEventType === 'midtermexam') {
          courseEvent.locations = [];
          let cursor = idx + 1;
          let setTime = true;

          while (!!splittedData[cursor].trim().match(timeRgx)) {
            // All the times should be same so use just the first one
            if (setTime) {
              const day = weekdaysMapper[
                splittedData[cursor].trim().slice(0, 3)
              ];
              const parts = splittedData[cursor].trim().slice(4).split('-');

              courseEvent.day = day;
              courseEvent.startTime = parts[0].replace('.', ':');
              courseEvent.endTime = parts[1].replace('.', ':');

              setTime = false;
            }
            const abbrev = locationList.shift();
            const locationParts = abbrev.split('/');
            const locationDetails = locationMapper[locationParts[0]];

            courseEvent.locations.push({
              abbrev: abbrev,
              room: locationParts[0],
              address: locationDetails.address,
              building: locationDetails.building,
              lat: locationDetails.lat,
              lng: locationDetails.lng,
            });

            cursor += 1;
          }
        } else {
          // The next piece contains the time info
          const nextDataPiece = splittedData[idx + 1].trim();

          if (!!nextDataPiece.match(timeRgx)) {
            const day = weekdaysMapper[
              nextDataPiece.slice(0, 3)
            ];
            const parts = nextDataPiece.slice(4).split('-');

            courseEvent.day = day;
            courseEvent.startTime = parts[0].replace('.', ':');
            courseEvent.endTime = parts[1].replace('.', ':');
          } else {
            isEvent = false;
          }
        }
      } else {
        isEvent = false;
      }

      // Add location data to event
      if (isEvent && courseEventType !== 'midtermexam' && locationList.length) {
        courseEvent.locations = [];

        const abbrev = locationList.shift();
        const locationParts = abbrev.split('/');
        const locationDetails = locationMapper[locationParts[0]];

        courseEvent.locations.push({
          abbrev: abbrev,
          room: locationParts[0],
          address: locationDetails.address,
          building: locationDetails.building,
          lat: locationDetails.lat,
          lng: locationDetails.lng,
        });
      }

      if (isEvent) {
        courseEvents.push(courseEvent);
      }
    });
  });

  return courseEvents;
}
