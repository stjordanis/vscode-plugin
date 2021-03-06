'use strict';

const temp = require('@atom/temp').track();
const fsp = require('fs-plus');
const path = require('path');
const {kite} = require('../src/kite');
const sinon = require('sinon');
const vscode = require('vscode');
const KiteAPI = require('kite-api');
const KiteConnect = require('kite-connector');
const NodeClient = require('kite-connector/lib/clients/node');
const {jsonPath, walk, describeForTest, featureSetPath, inLiveEnvironment} = require('./json/utils');
const {withKite} = require('kite-api/test/helpers/kite');
const ACTIONS = {};
const EXPECTATIONS = {};

walk(path.resolve(__dirname, 'json', 'actions'), '.js', file => {
  const key = path.basename(file).replace(path.extname(file), '');
  ACTIONS[key] = require(file);
});

walk(path.resolve(__dirname, 'json', 'expectations'), '.js', file => {
  const key = path.basename(file).replace(path.extname(file), '');
  EXPECTATIONS[key] = require(file);
});

function kiteSetup(setup) {
  switch (setup) {
    case 'authenticated':
      return {reachable: true};
    case 'unsupported':
    case 'not_supported':
      return {supported: false};
    case 'uninstalled':
    case 'not_installed':
      return {installed: false};
    case 'not_running':
      return {running: false};
    case 'unreachable':
    case 'not_reachable':
      return {reachable: false};
    case 'unlogged':
    case 'not_logged':
      return {reachable: true};
    default:
      return {supported: false};
  }
}

const featureSet = require(featureSetPath());

if(inLiveEnvironment()) {
  console.log("---------------------------------------", "LIVE TESTING ENABLED", "---------------------------------------");
}

describe('JSON tests', () => {
  featureSet.forEach(feature => {
    walk(jsonPath('tests', feature), (testFile) => {
      buildTest(require(testFile), testFile);
    });
  });
});

function buildTest(data, file) {

  if (data.live_environment === false) {
    return;
  }

  if (data.ignore) {
    return;
  }

  describeForTest(data, `${data.description} ('${file}')`, () => {
    let spy, rootDirPath;

    const root = () => rootDirPath;

    beforeEach('package activation', () => {
      rootDirPath = fsp.absolute(temp.mkdirSync('kite'));
      spy = sinon.spy(KiteAPI, 'request');
      kite._activate();
    })
    afterEach('package deactivation', () => {
      spy.restore();
      kite.deactivate();
    })

    withKite(kiteSetup(data.setup.kited), () => {
      const block = () => {
        data.test.reverse().reduce((f, s) => {
          switch (s.step) {
            case 'action':
              return buildAction(s, f, root);
            case 'expect':
              return buildExpectation(s, f, root);
            case 'expect_not':
              return buildExpectation(s, f, root, true);
            default:
              return f;
          }
        }, () => {})();
      };

      if(!inLiveEnvironment()) {
        block();
      } else {
        beforeEach('live setup', () => {
          KiteConnect.client = new NodeClient('localhost', '56624');
          return KiteConnect.request({
            path: '/testapi/request-history/reset',
            method: 'POST',
          });
        });

        block();
      }
    });
  });
}

function buildAction(action, block, root) {
  return () => describe(action.description, () => {
    ACTIONS[action.type] && ACTIONS[action.type]({action, root});

    describe('', () => {
      block && block();
    });
  });
}

function buildExpectation(expectation, block, root, not) {
  return () => {

    EXPECTATIONS[expectation.type] && EXPECTATIONS[expectation.type]({expectation, root, not});

    describe('', () => {
      block && block();
    })
  };
}
