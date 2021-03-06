/**
 * Copyright (c) 2017-2020 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import shortid from 'shortid';
import AlarmEvents from './AlarmEvents';
import {
  checkIfProtected,
  showNumberOfCookiesInIcon,
} from './BrowserActionService';
import {
  CADCOOKIENAME,
  cadLog,
  createPartialTabInfo,
  extractMainDomain,
  getHostname,
  getSetting,
  isAWebpage,
  isFirstPartyIsolate,
  returnOptionalCookieAPIAttributes,
} from './Libs';
import StoreUser from './StoreUser';

export default class TabEvents extends StoreUser {
  public static onTabDiscarded(
    tabId: number,
    changeInfo: browser.tabs.TabChangeInfo,
    tab: browser.tabs.Tab,
  ): void {
    if (getSetting(StoreUser.store.getState(), 'discardedCleanup')) {
      const debug = getSetting(
        StoreUser.store.getState(),
        'debugMode',
      ) as boolean;
      const partialTabInfo = createPartialTabInfo(tab);
      // Truncate ChangeInfo.favIconUrl as we have no use for it in debug.
      if (changeInfo.favIconUrl && debug) {
        changeInfo.favIconUrl = '***';
      }
      if (changeInfo.discarded || tab.discarded) {
        cadLog(
          {
            msg:
              'TabEvents.onTabDiscarded: Tab was discarded.  Executing cleanFromTabEvents',
            x: { tabId, changeInfo, partialTabInfo },
          },
          debug,
        );
        TabEvents.cleanFromTabEvents();
      } else {
        cadLog(
          {
            msg: 'TabEvents.onTabDiscarded:  Tab was not discarded.',
            x: { tabId, changeInfo, partialTabInfo },
          },
          debug,
        );
      }
    }
  }
  public static onTabUpdate(
    tabId: number,
    changeInfo: browser.tabs.TabChangeInfo,
    tab: browser.tabs.Tab,
  ): void {
    if (tab.status === 'complete') {
      const debug = getSetting(
        StoreUser.store.getState(),
        'debugMode',
      ) as boolean;
      const partialTabInfo = createPartialTabInfo(tab);
      // Truncate ChangeInfo.favIconUrl as we have no use for it in debug.
      if (changeInfo.favIconUrl && debug) {
        changeInfo.favIconUrl = '***';
      }
      if (!TabEvents.onTabUpdateDelay) {
        TabEvents.onTabUpdateDelay = true;
        cadLog(
          {
            msg:
              'TabEvents.onTabUpdate: action delay has been set for ~750 ms.',
            x: { tabId, changeInfo, partialTabInfo },
          },
          debug,
        );
        setTimeout(() => {
          cadLog(
            {
              msg: 'TabEvents.onTabUpdate: actions will now commence.',
              x: { tabId, changeInfo, partialTabInfo },
            },
            debug,
          );
          TabEvents.getAllCookieActions(tab);
          TabEvents.onTabUpdateDelay = false;
          cadLog(
            {
              msg:
                'TabEvents.onTabUpdate: actions have been processed and flag cleared.',
            },
            debug,
          );
        }, 750);
      } else {
        cadLog(
          {
            msg: 'TabEvents.onTabUpdate: actions delay is pending already.',
            x: { tabId, changeInfo, partialTabInfo },
          },
          debug,
        );
      }
    }
  }

  public static onDomainChange(
    tabId: number,
    changeInfo: browser.tabs.TabChangeInfo,
    tab: browser.tabs.Tab,
  ): void {
    const debug = getSetting(
      StoreUser.store.getState(),
      'debugMode',
    ) as boolean;
    if (tab.status === 'complete') {
      const partialTabInfo = createPartialTabInfo(tab);
      const mainDomain = extractMainDomain(getHostname(tab.url));
      // Truncate ChangeInfo.favIconUrl as we have no use for it in debug.
      if (changeInfo.favIconUrl && debug) {
        changeInfo.favIconUrl = '***';
      }
      if (TabEvents.tabToDomain[tabId] === undefined && mainDomain !== '') {
        cadLog(
          {
            msg: 'TabEvents.onDomainChange: First mainDomain set.',
            x: { tabId, changeInfo, mainDomain, partialTabInfo },
          },
          debug,
        );
        TabEvents.tabToDomain[tabId] = mainDomain;
      } else if (
        TabEvents.tabToDomain[tabId] !== mainDomain &&
        (mainDomain !== '' ||
          tab.url === 'about:blank' ||
          tab.url === 'about:home' ||
          tab.url === 'about:newtab' ||
          tab.url === 'chrome://newtab/')
      ) {
        const oldMainDomain = TabEvents.tabToDomain[tabId];
        TabEvents.tabToDomain[tabId] = mainDomain;
        if (getSetting(StoreUser.store.getState(), 'domainChangeCleanup')) {
          if (oldMainDomain === '') {
            cadLog(
              {
                msg:
                  'TabEvents.onDomainChange: mainDomain has changed, but previous domain may have been a blank or new tab.  Not executing domainChangeCleanup',
                x: { tabId, changeInfo, partialTabInfo },
              },
              debug,
            );
            return;
          }
          cadLog(
            {
              msg:
                'TabEvents.onDomainChange: mainDomain has changed.  Executing domainChangeCleanup',
              x: {
                tabId,
                changeInfo,
                oldMainDomain,
                mainDomain,
                partialTabInfo,
              },
            },
            debug,
          );
          TabEvents.cleanFromTabEvents();
        } else {
          cadLog(
            {
              msg:
                'TabEvents.onDomainChange: mainDomain has changed, but cleanOnDomainChange is not enabled.  Not cleaning.',
              x: {
                tabId,
                changeInfo,
                oldMainDomain,
                mainDomain,
                partialTabInfo,
              },
            },
            debug,
          );
        }
      } else {
        cadLog(
          {
            msg: 'TabEvents.onDomainChange: mainDomain has not changed yet.',
            x: { tabId, changeInfo, mainDomain, partialTabInfo },
          },
          debug,
        );
      }
    }
  }

  public static onDomainChangeRemove(
    tabId: number,
    removeInfo: {
      windowId: number;
      isWindowClosing: boolean;
    },
  ): void {
    cadLog(
      {
        msg:
          'TabEvents.onDomainChangeRemove: Tab was closed.  Removing old tabToDomain info.',
        x: { tabId, mainDomain: TabEvents.tabToDomain[tabId], removeInfo },
      },
      getSetting(StoreUser.store.getState(), 'debugMode') as boolean,
    );
    delete TabEvents.tabToDomain[tabId];
  }

  public static cleanFromTabEvents = async (): Promise<void> => {
    const debug = getSetting(
      StoreUser.store.getState(),
      'debugMode',
    ) as boolean;
    if (getSetting(StoreUser.store.getState(), 'activeMode')) {
      const alarm = await browser.alarms.get('activeModeAlarm');
      if (!alarm || (alarm.name && alarm.name !== 'activeModeAlarm')) {
        cadLog(
          {
            msg:
              'TabEvents.cleanFromTabEvents:  No Alarms detected.  Creating alarm for cleaning...',
          },
          debug,
        );
        await AlarmEvents.createActiveModeAlarm();
      } else {
        cadLog(
          {
            msg:
              'TabEvents.cleanFromTabEvents:  An alarm for cleaning was created already.  Cleaning will commence soon.',
            x: alarm,
          },
          debug,
        );
      }
    }
  };

  public static getAllCookieActions = async (
    tab: browser.tabs.Tab,
  ): Promise<void> => {
    if (!tab.url || tab.url === '') return;
    if (tab.url.startsWith('about:') || tab.url.startsWith('chrome:')) return;
    const debug = getSetting(
      StoreUser.store.getState(),
      'debugMode',
    ) as boolean;
    const partialTabInfo = createPartialTabInfo(tab);
    const hostname = getHostname(tab.url);
    if (hostname === '') {
      cadLog(
        {
          msg:
            'TabEvents.getAllCookieActions: hostname parsed empty for tab url.  Skipping Cookie Actions.',
          x: { partialTabInfo, hostname },
        },
        debug,
      );
      return;
    }
    const firstPartyIsolate = await isFirstPartyIsolate();
    let cookies: browser.cookies.Cookie[];
    if (hostname.startsWith('file:')) {
      const allCookies = await browser.cookies.getAll(
        returnOptionalCookieAPIAttributes(
          StoreUser.store.getState(),
          {
            storeId: tab.cookieStoreId,
          },
          firstPartyIsolate,
        ),
      );
      const regExp = new RegExp(hostname.slice(7)); // take out file://
      cadLog(
        {
          msg:
            'TabEvents.getAllCookieActions:  Local File Regex to test on cookie.path',
          x: { partialTabInfo, hostname, regExp: regExp.toString() },
        },
        debug,
      );
      cookies = allCookies.filter(
        (cookie) => cookie.domain === '' && regExp.test(cookie.path),
      );
    } else {
      cadLog(
        {
          msg:
            'TabEvents.getAllCookieActions:  browser.cookies.getAll for domain.',
          x: {
            partialTabInfo,
            domain: hostname,
            firstPartyDomain: extractMainDomain(hostname),
          },
        },
        debug,
      );
      cookies = await browser.cookies.getAll(
        returnOptionalCookieAPIAttributes(
          StoreUser.store.getState(),
          {
            domain: hostname,
            firstPartyDomain: extractMainDomain(hostname),
            storeId: tab.cookieStoreId,
          },
          firstPartyIsolate,
        ),
      );
    }
    cadLog(
      {
        msg: 'TabEvents.getAllCookieActions:  Filtered Cookie Count',
        x: {
          partialTabInfo,
          tabURL: tab.url,
          hostname,
          cookieCount: cookies.length,
        },
      },
      debug,
    );

    if (
      cookies.length === 0 &&
      (getSetting(StoreUser.store.getState(), 'cacheCleanup') ||
        getSetting(StoreUser.store.getState(), 'indexedDBCleanup') ||
        getSetting(StoreUser.store.getState(), 'localStorageCleanup') ||
        getSetting(StoreUser.store.getState(), 'pluginDataCleanup') ||
        getSetting(StoreUser.store.getState(), 'serviceWorkersCleanup')) &&
      isAWebpage(tab.url) &&
      !tab.url.startsWith('file:')
    ) {
      const cookiesAttributes = returnOptionalCookieAPIAttributes(
        StoreUser.store.getState(),
        {
          expirationDate: Math.floor(Date.now() / 1000 + 31557600),
          firstPartyDomain: extractMainDomain(getHostname(tab.url)),
          name: CADCOOKIENAME,
          path: `/${shortid.generate()}`,
          storeId: tab.cookieStoreId,
          url: tab.url,
          value: CADCOOKIENAME,
        },
        firstPartyIsolate,
      );
      await browser.cookies.set({ ...cookiesAttributes, url: tab.url });
      cadLog(
        {
          msg:
            'TabEvents.getAllCookieActions:  A temporary cookie has been set for future BrowsingData cleaning as the site did not set any cookies yet.',
          x: { partialTabInfo, cadLSCookie: cookiesAttributes },
        },
        debug,
      );
    }
    // Filter out cookie(s) that were set by this extension.
    const cookieLength =
      cookies.length -
      cookies.filter((cookie) => cookie.name === CADCOOKIENAME).length;
    if (cookies.length !== cookieLength) {
      cadLog(
        {
          msg:
            'TabEvents.getAllCookieActions:  New Cookie Count after filtering out cookie set by extension',
          x: { preFilterCount: cookies.length, newCookieCount: cookieLength },
        },
        debug,
      );
    }
    cadLog(
      {
        msg:
          'TabEvents.getAllCookieActions: executing checkIfProtected to update Icons and Title.',
      },
      debug,
    );
    await checkIfProtected(StoreUser.store.getState(), tab, cookieLength);

    // Exclude Firefox Android for browser icons and badge texts
    if (
      getSetting(StoreUser.store.getState(), 'showNumOfCookiesInIcon') &&
      (StoreUser.store.getState().cache.platformOs || '') !== 'android'
    ) {
      cadLog(
        {
          msg:
            'TabEvents.getAllCookieActions: executing showNumberOfCookiesInIcon.',
        },
        debug,
      );
      showNumberOfCookiesInIcon(tab, cookieLength);
    }
  };
  // Add a delay to prevent multiple spawns of the localstorage cookie
  protected static onTabUpdateDelay = false;

  protected static tabToDomain: { [key: number]: string } = {};
}
