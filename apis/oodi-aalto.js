/* eslint-disable no-use-before-define */

// import { Promise } from 'bluebird';

// const _ = require('lodash');
const moment = require('moment');
const webdriverio = require('webdriverio');
const locationMapper = require('../locations');
const weekdaysMapper = require('../weekdays');
const errorTypes = require('../errorTypes');
const oodiSearchUrl = 'http://oodi.aalto.fi/a/opintjakstied.jsp?' +
                      'html=1&Kieli=6&Tunniste=';

// Error handling
const Boom = require('boom');

const options = { desiredCapabilities: { browserName: 'phantomjs' } };

// Exposed methods
module.exports.getCourse = getCourse;


async function getCourse(courseCode) {
  const client = webdriverio.remote(options);
  const url = oodiSearchUrl + courseCode;
  const data = {};

  /*
   * 1) Open course's oodi page and scrape the table titles
   */
  const tableTitles = await client.init().url(url).getText('.tauluotsikko');

  // first title is eg. ME-E4300 Semantic Web, 5 cr
  const courseData = _parseCourseName(tableTitles[0]);

  if (!courseData) {
    console.log('COURSE NOT FOUND');
    throw Boom.notFound(errorTypes.ERROR_COURSE_NOT_FOUND);
  }

  // eg. 13.01.16 -07.04.16
  const fullDateRangeRgx = /^\d{2}\.\d{2}\.\d{2}\s-\d{2}\.\d{2}\.\d{2}$/;
  const durationCandidates = await client.getText('td[width="280"].tyyli0');

  const courseDurationList = durationCandidates
    .filter((candidate) => !!candidate.match(fullDateRangeRgx))
    .map((duration) => {
      const parts = duration.split('-');
      const start = moment.utc(parts[0].trim(), 'DD.MM.YY').toISOString();
      const end = moment.utc(parts[1].trim(), 'DD.MM.YY').toISOString();

      return { start, end };
    });

  const courseDuration = courseDurationList[0];

  // Add course info to data
  data.course = {
    ...courseData,
    ...courseDuration,
  };

  /*
   * 2) Open course's detail oodi page and scrape the events data
   */
  const nextPageLink = '*=' + courseData.name;

  let eventsData;
  try {
    eventsData = await client.click(nextPageLink).getText('table.kll');
  } catch (e) {
    console.log('No current/future teaching');
    throw Boom.notFound(errorTypes.ERROR_COURSE_HAS_NO_TEACHING);
  }

  let locationsData = await client.getValue('td[width="36%"] input.submit2');

  /*
   * NOTE: if event does not have a location specified => it is impossible to
   * attach the location info correctly to an event since eventsData and
   * locationsData need to have same length (indexes match)
   */

  if (!eventsData) {
    console.log('COURSE EVENTS NOT FOUND');
    throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_NOT_FOUND);
  }

  if (!locationsData) {
    console.log('COURSE EVENTS LOCATIONS NOT FOUND');
    throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_LOCATION_NOT_FOUND);
  }

  // Events and locations data needs to be an array for the parser
  eventsData = Array.isArray(eventsData)
    ? eventsData
    : [eventsData];

  locationsData = Array.isArray(locationsData)
    ? locationsData
    : [locationsData];

  const courseEvents = _parseCourseEvents(eventsData, locationsData);

  if (!courseEvents) {
    console.log('UNABLE TO PARSE COURSE EVENTS/LOCATIONS');
    throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_NOT_PARSED);
  }

  // Add courses events info to data
  data.events = courseEvents;

  return data;
}


/* ***** Own methods ************************ */
function _parseCourseName(courseInfo) {
  const parts = courseInfo.split(',');

  if (parts.length === 1) return null;

  const credits = parts.pop().trim();
  const parts2 = parts[0].split(' ');
  const code = parts2.shift();
  const name = parts2.join(' ').trim();

  return { code, name, credits };
}

function _createSubEvents(ddmmyyStart, ddmmyyEnd) {
  const subEvents = [];
  const start = moment(ddmmyyStart, 'DDMMYY');
  const end = moment(ddmmyyEnd, 'DDMMYY');

  while (start.isBefore(end)) {
    subEvents.push({ id: null, date: start.format('MM-DD-YYYY') });
    start.add(7, 'days');
  }
  subEvents.push({ id: null, date: end.format('MM-DD-YYYY') });
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
    /* eslint-disable max-len*/
    const timeRgx = /^(?:mon|tue|wed|thu|fri|sat|sun) \d{2}\.\d{2}-\d{2}\.\d{2}$/;
    /* eslint-enable max-len*/

    splittedData.forEach((dataPiece, idx) => {
      let isEvent = true;

      // Init new event
      const courseEvent = { type: courseEventType };

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
          { id: null, date: dataPiece }
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
              // TODO use moment instead
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
              room: locationParts[0],
              address: locationDetails.address,
              building: locationDetails.building,
              lat: locationDetails.lat,
              lng: locationDetails.lng,
              abbrev,
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
          room: locationParts[0],
          address: locationDetails.address,
          building: locationDetails.building,
          lat: locationDetails.lat,
          lng: locationDetails.lng,
          abbrev,
        });
      }

      if (isEvent) {
        courseEvents.push(courseEvent);
      }
    });
  });

  return courseEvents;
}
