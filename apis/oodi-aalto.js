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

/* eslint-disable no-use-before-define */

import moment from 'moment';
import weekdaysMapper from '../weekdays';
import errorTypes from '../errorTypes';
import { locationMapper } from '../locations';
import Boom from 'boom';
import _ from 'lodash';

require('es6-promise').polyfill();
require('isomorphic-fetch');

const cheerio = require('cheerio');

/* eslint-disable max-len */
const oodiSearchUrl = 'http://oodi.aalto.fi/a/opintjakstied.jsp?html=1&Kieli=6&Tunniste=';
/* eslint-enable max-len */

// Exposed methods
module.exports.getCourse = getCourse;

async function getCourse(courseCode) {
  const data = {};
  const pageData = await fetch(`${oodiSearchUrl}${courseCode}`);
  const html = await pageData.text();

  // Load html to cheerio for scraping
  let $ = cheerio.load(html, {
    lowerCaseTags: true,
    normalizeWhitespace: true,
  });

  if (html.indexOf('No teaching') !== -1) {
    console.log('No current/future teaching');
    throw Boom.notFound(errorTypes.COURSE_HAS_NO_TEACHING);
  }

  try {
    const tableTitles = $('.tauluotsikko').map((i, el) => $(el).text()).get();

    // first title is eg. ME-E4300 Semantic Web, 5 cr
    const courseData = _parseCourseName(tableTitles[0]);

    // eg. 13.01.16 -07.04.16
    const fullDateRangeRgx = /^\d{2}\.\d{2}\.\d{2}\s-\d{2}\.\d{2}\.\d{2}$/;
    let durationCandidates = $('td[width="280"].tyyli0')
      .map((i, el) => $(el).text().trim()).get();

    // If only a single candidate is found, make it a list too
    if (typeof durationCandidates === 'string') {
      durationCandidates = [ durationCandidates ];
    }

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
    data.course = { ...courseData, ...courseDuration };
  } catch (e) {
    console.log('COURSE NOT FOUND', e);
    throw Boom.notFound(errorTypes.COURSE_NOT_FOUND);
  }

  /*
   * 2) Open course's detail oodi page and scrape the events data
   */

  const linkPattern = `(\/a\/opettaptied\.jsp|Tunniste=${data.course.code})`;
  const linkRgx = new RegExp(linkPattern, 'g');

  // Find the correct link to course's info page

  /* NOTE: these links have some variations which is why we need to check
   * for different types of links
   */
  const eventLink = $(`td.tyyli0 > a[href*='${courseCode}']`).filter(
    (i, el) => {
      // 1) Check course name match
      if ($(el).text().trim().indexOf(data.course.name) !== -1) {
        return true;
      // 2) That the link matches
      } else if (linkRgx.test( $(el).attr('href') ) &&
                 $(el).text().indexOf('Register') === -1) {
        return true;
      }
      return false;
    }
  ).first().attr('href');

  // OLD WAY
  // const eventLink = $(`td.tyyli0 > a[href*='${courseCode}']`).filter(
  //   (i, el) => $(el).text().trim().indexOf(data.course.name) !== -1
  // ).first().attr('href');

  if (!eventLink) {
    console.log(`Could not parse course's info page link`);
    throw Boom.badData(`Could not parse course's info page link`);
  }

  const nextPageLink = `http://oodi.aalto.fi${eventLink}`;

  // console.log('===> nextPageLink', nextPageLink);

  const mainPageData = await fetch(`${nextPageLink}`);
  const mainHtml = await mainPageData.text();

  // Load new html to cheerio fro scraping
  $ = cheerio.load(mainHtml, {
    lowerCaseTags: true,
    normalizeWhitespace: false,
  });

  try {
    /* eslint-disable max-len */
    // const pattern = `Course|Lecture|Exercises|Midtermexam|${data.course.name}`;
    // const re = new RegExp(pattern);

    const scraped = $(`table[width='100%'][border='0']`)
      .filter((i, el) => $(el).parent().attr('width') !== '36%')
      .map((i, el) => $(el).text().trim())
      // .filter((i, el) => re.test(el)) WE MIGHT NO EVEN NEED THIS?
      .filter((i, el) => el.indexOf('Teaching event') === -1)
      .get();

    /* eslint-enable max-len */

    const uniqScraped = _.uniq(scraped);
    const eventsData = [];

    // Different known event types. Not necessarily complete.
    // TODO: We don't perfectly parse the dates for each of these e.g.
    // self studying or seminar as they often omit weekdays from their date
    const eventTypes = [
      'Lecture', 'Exercises', 'Midtermexam', 'Seminar',
      'Multiform teaching', 'Self studying', 'Course',
    ];

    const databaseTranslation = {
      'Lecture': 'lecture', 'Exercises': 'exercise',
      'Midtermexam': 'midtermexam', 'Seminar': 'seminar',
      'Multiform teaching': 'multiformteaching',
      'Self studying': 'selfstudying',
    };

    let currentEventType = null;
    let hasLectures = false;

    // Check if there are no lectures on this course
    uniqScraped.forEach((e) => {
      if (e.indexOf('Lecture') !== -1) { hasLectures = true; return; }
    });

    // Loop through the data while maintaining the event type
    uniqScraped.forEach((e) => {
      eventTypes.forEach((t) => {
        if (e.indexOf(t) !== -1) {
          currentEventType = t;
          return;
        }
      });

      const pure = e
        .replace(/ /g, '')
        .replace(/(\n)+/g, '#');

      /* Exception for courses where the lecture data
       * is under the header 'Course'
       * TODO: So far we don't know how to parse the date data from this kind of
       * events as it's not usually in the same date format as lectures etc.
       * See ELO-E1504
       */
      if (currentEventType === 'Course' && !hasLectures) {
        eventsData.push({ type: 'lecture', data: pure });
        return;
      }

      if (currentEventType) {
        eventsData.push(
          { type: databaseTranslation[currentEventType], data: pure }
        );
      }
    });


    let locationsData =
      $(`td[width='36%'] input.submit2[name*='LINKOPETPAIK_']`)
      .map((i, el) => $(el).val()).get();

    if (!eventsData) {
      console.log('COURSE EVENTS NOT FOUND');
      throw Boom.notFound(errorTypes.COURSE_EVENTS_NOT_FOUND);
    }

    if (!locationsData) {
      console.log('COURSE EVENTS LOCATIONS NOT FOUND');
      throw Boom.notFound(errorTypes.COURSE_EVENTS_LOCATION_NOT_FOUND);
    }

    locationsData = Array.isArray(locationsData)
      ? locationsData
      : [locationsData];

    const separator = '#';
    const courseEventsLists = eventsData.map((e) => _parseCourseEvents(
      e, locationsData, separator
    ));

    const courseEvents = _.flatten(courseEventsLists);

    if (!courseEvents) {
      console.log('UNABLE TO PARSE COURSE EVENTS/LOCATIONS');
      throw Boom.notFound(errorTypes.COURSE_EVENTS_NOT_PARSED);
    }

    // Add course's events info to data
    data.events = courseEvents;

    return data;
  } catch (e) {
    throw Boom.notFound(errorTypes.COURSE_HAS_NO_TEACHING);
  }
}

/* ***** Own methods ************************ */
function _parseCourseName(courseInfo) {
  const parts = courseInfo.split(',');

  if (parts.length === 1) return null;

  const parts2 = parts.shift().replace(/\s/g, '#').split('#');
  const credits = parts.pop().replace(/\s/g, '');
  const code = parts2.shift().replace(/\s/g, '');

  let name;
  if (parts.length) {
    name = `${parts2.join(' ')},${parts.join(',')}`;
  } else {
    name = `${parts2.join(' ')}`;
  }

  return { code, name, credits };
}


function _createSubEvents(ddmmyyStart, ddmmyyEnd) {
  const subEvents = [];
  const start = moment(ddmmyyStart, 'DDMMYY');
  const end = moment(ddmmyyEnd, 'DDMMYY');

  while (start.isBefore(end)) {
    subEvents.push({ date: start.format('MM-DD-YYYY') });
    start.add(7, 'days');
  }
  subEvents.push({ date: end.format('MM-DD-YYYY') });
  return subEvents;
}


function _parseCourseEvents(eventSection, locationList, separator) {
  const courseEvents = [];
  const splittedData = eventSection.data.split(separator);

  const dateRangeRgx = /^\d{2}\.\d{2}\.-\d{2}\.\d{2}\.\d{2}$/;
  const dateSingleRgx = /^\d{2}\.\d{2}\.\d{2}(?! klo)$/;
  /* eslint-disable max-len*/
  // eg. tue 12.15-14.00
  const timeRgx = /^(?:mon|tue|wed|thu|fri|sat|sun)\s\d{2}\.\d{2}-\d{2}\.\d{2}$/;
  /* eslint-enable max-len*/

  splittedData.forEach((dataPiece, idx) => {
    let isEvent = true;

    // Init new event
    const courseEvent = { type: eventSection.type };

    /*
     * Test if event has single or ranged date
     * => eg. "07.01.-11.02.16" or "11.02.16"
     */
    courseEvent.subEvents = [];
    if (!!dataPiece.trim().match(dateRangeRgx)) {
      const parts = dataPiece.split('-');
      const ddmmyyEnd = parts[1];
      const ddmmyyStartParts = parts[0].split('.');
      const ddmmyyEndParts = parts[1].split('.');

      const ddmmyyStart = !!ddmmyyStartParts[2]
        ? ddmmyyStartParts.join('.')
        : ddmmyyStartParts.join('.') + ddmmyyEndParts[2];

      const subEvents = _createSubEvents(ddmmyyStart, ddmmyyEnd);
      courseEvent.subEvents = subEvents;
    } else if (!!dataPiece.trim().match(dateSingleRgx)) {
      courseEvent.subEvents.push( { date: dataPiece } );
    } else {
      isEvent = false;
    }

    // Test if event has time => eg. "thu 13.15-15.00"
    if (isEvent && splittedData.length - 1 >= idx + 1) {
      if (eventSection.type === 'midtermexam') {
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
          const locationDetails = locationMapper[locationParts[0]] || {};

          courseEvent.locations.push({
            room: locationParts[0],
            address: locationDetails.address || null,
            building: locationDetails.building || null,
            lat: locationDetails.lat || null,
            lng: locationDetails.lng || null,
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
    if (isEvent && eventSection.type !== 'midtermexam' && locationList.length) {
      courseEvent.locations = [];

      const abbrev = locationList.shift();

      // If there's location data, push it
      if (abbrev) {
        const locationParts = abbrev.split('/');
        const locationDetails = locationMapper[locationParts[0]] || {};

        courseEvent.locations.push({
          room: locationParts[0],
          address: locationDetails.address || null,
          building: locationDetails.building || null,
          lat: locationDetails.lat || null,
          lng: locationDetails.lng || null,
          abbrev,
        });
      }
    }

    if (isEvent) {
      courseEvents.push(courseEvent);
    }
  });

  return courseEvents;
}
