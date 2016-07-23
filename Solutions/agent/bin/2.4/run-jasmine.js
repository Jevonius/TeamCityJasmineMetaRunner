var system = require('system'),
  env = system.env;

/**
 * Wait until the test condition is true or a timeout occurs. Useful for waiting
 * on a server response or for a ui change (fadeIn, etc.) to occur.
 *
 * @param testFx javascript condition that evaluates to a boolean,
 * it can be passed in as a string (e.g.: "1 == 1" or "$('#bar').is(':visible')" or
 * as a callback function.
 * @param onReady what to do when testFx condition is fulfilled,
 * it can be passed in as a string (e.g.: "1 == 1" or "$('#bar').is(':visible')" or
 * as a callback function.
 * @param timeOutMillis the max amount of time to wait. If not specified, 3 sec is used.
 */
function waitFor(testFx, onReady, timeOutMillis) {
    var maxtimeOutMillis = timeOutMillis ? timeOutMillis : 3001, //< Default Max Timeout is 3s
        start = new Date().getTime(),
        condition = false,
        interval = setInterval(function () {
            if ((new Date().getTime() - start < maxtimeOutMillis) && !condition) {
                // If not time-out yet and condition not yet fulfilled
                condition = (typeof (testFx) === "string" ? eval(testFx) : testFx()); //< defensive code
            } else {
                if (!condition) {
                    // If condition still not fulfilled (timeout but condition is 'false')
                    console.log("'waitFor()' timeout");
                    if (env.hasOwnProperty('TEAMCITY_PROJECT_NAME')) {
                    	console.log("##teamcity[message text='Timeout while running tests' errorDetails='waitFor timeout while attempting to run tests. Timeout: " + maxtimeOutMillis + "ms.' status='ERROR']");
                    }
                    phantom.exit(1);
                } else {
                    // Condition fulfilled (timeout and/or condition is 'true')
                    console.log("'waitFor()' finished in " + (new Date().getTime() - start) + "ms.");
                    typeof (onReady) === "string" ? eval(onReady) : onReady(); //< Do what it's supposed to do once the condition is fulfilled
                    clearInterval(interval); //< Stop this interval
                }
            }
        }, 100); //< repeat check every 100ms
};

if (system.args.length !== 2) {
    console.log('Usage: run-jasmine.js URL');
    phantom.exit(1);
}

var page = require('webpage').create();

/**
 *
##teamcity[testSuiteStarted name='suite.name']
##teamcity[testSuiteStarted name='nested.suite']
##teamcity[testStarted name='package_or_namespace.ClassName.TestName']
##teamcity[testFailed name='package_or_namespace.ClassName.TestName' message='The number should be 20000' details='expected:<20000> but was:<10000>']
##teamcity[testFinished name='package_or_namespace.ClassName.TestName']
##teamcity[testSuiteFinished name='nested.suite']
##teamcity[testSuiteFinished name='suite.name']
 */
// Route "console.log()" calls from within the Page context to the main Phantom context (i.e. current "this")
page.onConsoleMessage = function (msg) {
    var teamCityMessage = msg.indexOf('TEAMCITY_') === 0;
    if (teamCityMessage) {
        if (!env.hasOwnProperty('TEAMCITY_PROJECT_NAME')) return;
        var separatorIndex = msg.indexOf(':');
        var command = msg.substring(0, separatorIndex);
        var data = JSON.parse(msg.substring(separatorIndex + 1));
        switch (command) {
            case 'TEAMCITY_TESTSTARTED': {
                console.log("##teamcity[testStarted name='" + escape(data.name) + "']");
                break;
            }
            case 'TEAMCITY_TESTFINISHED': {
                console.log("##teamcity[testFinished name='" + escape(data.name) + "']");
                break;
            }
            case 'TEAMCITY_SUITESTARTED': {
                console.log("##teamcity[testSuiteStarted name='" + escape(data.suite) + "']");
                break;
            }
            case 'TEAMCITY_SUITEFINISHED': {
                console.log("##teamcity[testSuiteFinished name='" + escape(data.suite) + "']");
                break;
            }
            case 'TEAMCITY_TESTFAILED': {
                console.log("##teamcity[testFailed name='" + escape(data.name) + "' message='" + escape(data.message) + "']");
                break;
            }
        }
    }
    else {
        if (env.hasOwnProperty('TEAMCITY_PROJECT_NAME')) return;
        console.log(msg);
    }

    function pad(n) { return n < 10 ? '0'+n : n; }
    function padThree(n) { return n < 10 ? '00'+n : n < 100 ? '0'+n : n; }
    function ISODateString(d) {
        return d.getUTCFullYear() + '-' +
            pad(d.getUTCMonth()+1) + '-' +
            pad(d.getUTCDate()) + 'T' +
            pad(d.getUTCHours()) + ':' +
            pad(d.getUTCMinutes()) + ':' +
            pad(d.getUTCSeconds()) + '.' +
            // TeamCity wants ss.SSS
            padThree(d.getUTCMilliseconds());
    }
    function escape(str) {
        if(!str) {
            return "";
        }
        if (Object.prototype.toString.call(str) === '[object Date]') {
            return ISODateString(str);
        }

        return str.replace(/\|/g, "||")
            .replace(/\'/g, "|'")
            .replace(/\n/g, "|n")
            .replace(/\r/g, "|r")
            .replace(/\u0085/g, "|x")
            .replace(/\u2028/g, "|l")
            .replace(/\u2029/g, "|p")
            .replace(/\[/g, "|[")
            .replace(/]/g, "|]");
    }
};

page.open(system.args[1], function (status) {
    if (status !== "success") {
    	console.log("Unable to access input file/url");
    	if (env.hasOwnProperty('TEAMCITY_PROJECT_NAME')) {
    		console.log("##teamcity[message text='Unable to load input file' errorDetails='File was probably not found.' status='ERROR']");
    	}
        phantom.exit(1);
    } else {
        waitFor(function () {
            return page.evaluate(function () {
                return document.body.querySelector('.jasmine-symbolSummary .jasmine-pending') === null &&
                    (document.body.querySelector('.jasmine-alert > .jasmine-bar.jasmine-passed') !== null || 
                     document.body.querySelector('.jasmine-alert > .jasmine-bar.jasmine-failed') !== null);
            });
        }, function () {
        	var exitCode = page.evaluate(function () {
        		var failureDetails = {};
        		var failList = document.body.querySelectorAll('.jasmine-results > .jasmine-failures > .jasmine-spec-detail.jasmine-failed');
        		if (failList && failList.length > 0) {
        			console.log('');
        			console.log(failList.length + ' test(s) FAILED:');
        			for (var i = 0; i < failList.length; ++i) {
        				var failure = failList[i];
        				var name = failure.querySelector('.jasmine-description').children[0];
        				var failureDetail = {
        					href: name.attributes["href"].value,
        					title: name.attributes["title"].value,
        					message: failure.querySelector('.jasmine-result-message').innerText
        				};
        				failureDetails[failureDetail.href] = failureDetail;
        				console.log('Failure: ' + failureDetail.title);
        			}
        			console.log('');
        		}

        		var suiteWriter = function (suiteElements) {
        			if (suiteElements.children.length > 0) {
        				var suiteName = suiteElements.children[0].innerText;
        				console.log('TEAMCITY_SUITESTARTED:' + JSON.stringify({ suite: suiteName }));
        				for (var c = 1; c < suiteElements.children.length; c++) {
        					var childElement = suiteElements.children[c];
        					if (childElement.className === "jasmine-suite") {
        						suiteWriter(childElement);
        					} else if (childElement.className === "jasmine-specs") {
        						var testEl = childElement.children[0];
        						var testName = testEl.innerText;
        						console.log('TEAMCITY_TESTSTARTED:' + JSON.stringify({ name: testName }));
        						if (testEl.className === "jasmine-failed") {
        							var failureDetail = failureDetails[testEl.children[0].attributes["href"].value];
        							if (failureDetail !== undefined) {
        								console.log('TEAMCITY_TESTFAILED:' + JSON.stringify({ name: testName, message: failureDetail.message }));
        							} else {
        								console.log('TEAMCITY_TESTFAILED:' + JSON.stringify({ name: testName, message: "Unable to find details." }));
        							}
        						}
        						console.log('TEAMCITY_TESTFINISHED:' + JSON.stringify({ name: testName }));
        					}
        				}
        				console.log('TEAMCITY_SUITEFINISHED:' + JSON.stringify({ suite: suiteName }));
        			}
        		};

        		var rootSuites = document.body.querySelector('.jasmine-results > .jasmine-summary');
        		if (rootSuites && rootSuites.children) {
        			for (var r = 0; r < rootSuites.children.length; r++) {
        				suiteWriter(rootSuites.children[r]);
        			}
        		}

                if (failList && failList.length > 0) {
                    return 1;
                } else {
                    return 0;
                }
            });
            phantom.exit(exitCode);
        });
    }
});
