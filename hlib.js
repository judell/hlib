// promisifed xhr
// replace with fetch when it is sufficiently standard

function httpRequest(opts) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url);
    xhr.onload = function() {
      if (this.status >= 200 && this.status < 300) {
        resolve({
          response: xhr.response, 
          status: xhr.status,
          headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
        });
      } else {
        console.log("http", opts.url, this.status);
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function(e) {
      console.log("httpRequest", opts.url, this.status);
      reject({
        error: e,
        status: this.status,
        statusText: xhr.statusText
      });
    };
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function(key) {
        xhr.setRequestHeader(key, opts.headers[key]);
      });
    }
    var params = opts.params;
    if (params && typeof params === "object") {
      params = Object.keys(params)
        .map(function(key) {
          return (

            encodeURIComponent(key) +
            "=" +
            encodeURIComponent(params[key])
          );
        })
        .join("&");
    }
    xhr.send(params);
  });
}

function _search(params, callback, offset, annos, replies, progressId) {

  var max = 2000;
  if (params.max) {
    max = params.max;
  }

  var limit = 200;
  if (max <= limit) {
    limit = max;
  }

  if (progressId) {
    getById(progressId).innerHTML += '.';
  }

  var opts = {
    method: 'get',
    url: `https://hypothes.is/api/search?_separate_replies=true&limit=${limit}&offset=${offset}`,
  };

  var facets = ['group', 'user', 'tag', 'url', 'any'];

  facets.forEach(function(facet){
    if (params[facet]) {
      var encodedValue = encodeURIComponent(params[facet]);
      opts.url += `&${facet}=${encodedValue}`;
    }   
  });

  opts = setApiTokenHeaders(opts);

  httpRequest(opts)
    .then( function (data) {
      data = JSON.parse(data.response);
      annos = annos.concat(data.rows);
      replies = replies.concat(data.replies);
      if ( data.rows.length === 0 || annos.length >= max ) {
        callback (annos, replies);
      }
      else {
        _search(params, callback, offset+limit, annos, replies, progressId);
      }
    });

  }

function hApiSearch(params, callback, progressId) {
  var offset = 0;
  var annos = [];
  var replies = [];
  _search(params, callback, offset, annos, replies, progressId)
}

function findRepliesForId(id, replies) {
  var _replies = replies.filter(function (x) {
    return (x.references.indexOf(id) != -1);
  });
  return _replies.map(a => parseAnnotation(a)).reverse();
}

// organize a set of annotations, from https://hypothes.is/api/search, by url
function gatherAnnotationsByUrl(rows) {
  var urls = {};
  var ids = {};
  var titles = {};
  var urlUpdates = {};
  var annos = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var annotation = parseAnnotation(row); // parse the annotation
    var id = annotation.id;
    annos[id] = annotation; // save it by id
    var url = annotation.url; // remember these things
    url = url.replace(/\/$/, ""); // strip trailing slash
    var updated = annotation.updated;
    var title = annotation.title;
    if (!title)
      title = url;
    if (url in urls) {   // add/update this url's info
      urls[url] += 1;
      ids[url].push(id);
      if (updated > urlUpdates.url)
        urlUpdates[url] = updated;
    } else {            // init this url's info
      urls[url] = 1;
      ids[url] = [id];
      titles[url] = title;
      urlUpdates[url] = updated;
    }
  }

  return {
    ids: ids,
    urlUpdates: urlUpdates,
    annos: annos,
    titles: titles,
    urls: urls
  };
}

function parseAnnotation(row) {
  var id = row.id;
  var url = row.uri;
  var updated = row.updated.slice(0, 19);
  var group = row.group;
  var title = url;
  var refs = row.references ? row.references : [];
  var user = row.user.replace("acct:", "").replace("@hypothes.is", "");
  var quote = "";
  if ( row.target && row.target.length )
    {
    var selectors = row.target[0].selector;
    if (selectors) {
      for (var i = 0; i < selectors.length; i++) {
        selector = selectors[i];
        if ( selector.type === "TextQuoteSelector" ) {
          quote = selector.exact;
        }
      }
    }
  }
  var text = row.text ? row.text : "";

  var tags = row.tags;

  try {
    title = row.document.title;
    if (typeof title === "object") {
      title = title[0];
    }
    else {
      title = url;
    }
  } catch (e) {
    title = url;
  }

  var isReply = refs.length > 0;

  var isPagenote = row.target && ! row.target[0].hasOwnProperty('selector');

  return {
    id: id,
    url: url,
    updated: updated,
    title: title,
    refs: refs,
    isReply: isReply,
    isPagenote: isPagenote,
    user: user,
    text: text,
    quote: quote,
    tags: tags,
    group: group,
    target: row.target,
  };
}

function parseSelectors(target) {
  var parsedSelectors = {};
  var firstTarget = target[0];
  if (firstTarget) {
    var selectors = firstTarget.selector;
    if (selectors) {
      var textQuote = selectors.filter(x => x.type === 'TextQuoteSelector');
      if ( textQuote.length ) {
        parsedSelectors['TextQuote'] = {
          'exact': textQuote[0].exact,
          'prefix': textQuote[0].prefix,
          'suffix': textQuote[0].suffix,
        };
      }
      var textPosition = selectors.filter(x => x.type === 'TextPositionSelector');
      if ( textPosition.length ) {
        parsedSelectors['TextPosition'] = {
          'start': textPosition[0].start,
          'end': textPosition[0].end,
        };
      }
    }
  }
  return parsedSelectors;
}

// get url parameters
function gup(name, str) {
  if (! str) {
    str = window.location.href;
  }
  else {
    str = '?' + str;
  }
  name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
  var regexS = "[\\?&]" + name + "=([^&#]*)";
  var regex = new RegExp(regexS);
  var results = regex.exec(str);
  if (results == null) {
      return "";
  }
  else {
      return results[1];
  }
}

function getById(id) {
  return document.getElementById(id);
}

function appendBody(element) {
  document.body.appendChild(element);
}

function getDomainFromUrl(url) {
  var a = document.createElement('a');
  a.href = url;
  return a.hostname;
} 

function setApiTokenHeaders(opts, token) {
  if (! token ) {
    token = getToken();
  }
  if ( token ) {
    opts.headers = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json;charset=utf-8',
    };
  }
  return opts;
}

function getToken() {
  return getFromUrlParamOrLocalStorage('h_token');
}

function getUser() {
  return getFromUrlParamOrLocalStorage('h_user');
}

function getGroup() {
  var group = getFromUrlParamOrLocalStorage('h_group');
  return group != '' ? group : '__world__';
}

function setToken() {

  setLocalStorageFromForm('tokenForm', 'h_token');
}

function setUser() {
  setLocalStorageFromForm('userForm', 'h_user');
}

function setGroup() {
  setLocalStorageFromForm('groupForm', 'h_group');
}

function setLocalStorageFromForm(formId, storageKey) {
  var value = getById(formId).value;
  localStorage.setItem(storageKey, value);
}

function getFromUrlParamOrLocalStorage(key, _default) {
  var value = gup(key);

  if ( value === '' ) {
    value = localStorage.getItem(`${key}`);
  }

  if ( (! value || value === '') && _default ) {
    value = _default;
  }

  if (! value) {
    value = '';
  }

  return value;
}

function createPermissions(username, group) {
  var permissions = {
    "read": ['group:' + group],
    "update": ['acct:' + username + '@hypothes.is'],
    "delete": ['acct:' + username + '@hypothes.is'],
  };
  return permissions;
}

function createTextQuoteSelector(exact, prefix, suffix) {
  var selector = {
    type: "TextQuoteSelector",
    exact: exact,
  }
  if (prefix) {
    selector.prefix = prefix;
  }
  if (suffix) {
    selector.suffix = suffix;
  }
  return selector;
}

function createTextPositionSelector(start, end) {
  return {
    type: "TextPositionSelector",
    start: start,
    end: end
  }
}

/* 
Expects an object with these keys:
  uri: Target to which annotation will post
  exact, prefix, suffix: Info for TextQuoteSelector, only exact is required
  start, stop: Info for TextPositionSelector, optional
  username: Hypothesis username
  group: Hypothesis group (use '__world__' for Public)
  text: Body of annotation (could be markdown or html, whatever the Hypothesis editor supports)
  tags: Hypothesis tags
  extra: Extra data, invisible to user but available through H API
*/
function createAnnotationPayload(params) {
  //uri, exact, username, group, text, tags, extra){
  var textQuoteSelector, textPositionSelector;

  if (params.exact) { // we have minimum info need for a TextQuoteSelector
    textQuoteSelector = createTextQuoteSelector(params.exact, params.prefix, params.suffix);
  }

  if (params.start && params.end) {
    textPositionSelector = createTextPositionSelector(params.start, params.end);
  }

  var target = {
    source: params.uri,
  }

  if (textQuoteSelector) { // we have minimum info for an annotation target
    var selectors = [textQuoteSelector];
    if (textPositionSelector) { // we can also use TextPosition
      selectors.push(textPositionSelector);
    }
    target['selector'] = selectors;
  }

  var payload = {
    "uri": params.uri,
    "group": params.group,
    "permissions": createPermissions(params.username, params.group),
    "text": params.text,
    "document": {
      "title": [params.uri],
    },
    "tags": params.tags ? params.tags : [],
  }

  if (target) {
    payload.target = [target];
  }

  if (params.extra) {
    payload.extra = params.extra;
  }

  return JSON.stringify(payload);
}

function postAnnotation(payload, token) {
  var url = 'https://hypothes.is/api/annotations'
  var opts = {
    method: 'post',
    params: payload,
    url: url,
  };

  opts = setApiTokenHeaders(opts, token);

  return httpRequest(opts);
}

function postAnnotationAndRedirect(payload, token, queryFragment) {
  return postAnnotation(payload, token)
    .then(data => {
      var response = JSON.parse(data.response);
      if (data.status != 200) {
        alert(`hlib status ${data.status}`);
        return;
      }
      var url = response.uri;
      if (queryFragment) {
        url += '#' + queryFragment;
      }
      location.href = url;
    })
    .catch(e => {
      console.log(e);
    });
}

function updateAnnotation(id, token, payload) {
  var url = `https://hypothes.is/api/annotations/${id}`;
  var opts = {
    method: 'put',
    params: payload,
    url: url,
  };
  opts = setApiTokenHeaders(opts, token);
  return httpRequest(opts);
}

function deleteAnnotation(id, token) {
  var url = `https://hypothes.is/api/annotations/${id}`;
  var opts = {
    method: 'delete',
    url: url,
  };
  opts = setApiTokenHeaders(opts, token);
  return httpRequest(opts);
}

function createApiTokenInputForm (element) {
  let tokenArgs = {
    element: element,
    name: 'Hypothesis API token',
    id: 'token',
    value: getToken(),
    onChange: 'setToken',
    type: 'password',
    msg: 'to write (or read protected) annotations, copy/paste your <a href="https://hypothes.is/profile/developer">token</a>',
  }
  createNamedInputForm(tokenArgs);
}

function createUserInputForm (element) {
  let userArgs = {
    element: element,
    name: 'Hypothesis username',
    id: 'user',
    value: getUser(),
    onChange: 'setUser',
    type: '',
    msg: '',
    };
  createNamedInputForm(userArgs);
}

function setSelectedGroup() {
  var selectedGroup = getSelectedGroup();
  localStorage.setItem('h_group', selectedGroup);
}

function getSelectedGroup() {
  var selectedGroup;
  var groupSelector = document.querySelector('#groupsList');
  if ( getToken() && groupSelector) {
    var selectedGroupIndex = groupSelector.selectedIndex;
    selectedGroup = groupSelector[selectedGroupIndex].value;
  }
  else {
    selectedGroup = '';
  }
  return selectedGroup;
}

function createGroupInputForm (e) {

  function createGroupSelector(groups) {
    var currentGroup = getGroup();
    var options = '';
    groups.forEach(g => {
      var selected = ''
      if (currentGroup == g.id) {
        selected = 'selected';
      }
      options += `<option ${selected} value="${g.id}">${g.name}</option>\n`;
    });
    var selector = `
<select onchange="setSelectedGroup()" id="groupsList">
${options}
</select>`;
  return selector;
  }
  
  var token = getToken();
  var opts = {
    method: 'get',
    url: 'https://hypothes.is/api/profile',
  }
  opts = setApiTokenHeaders(opts, token);
  httpRequest(opts)
    .then( data => {
      var response = JSON.parse(data.response);
      var msg = '';
      if (! token) {
        msg = 'add token and refresh to see all groups here';
      }
      var form = `
<div class="formLabel">Hypothesis Group</div>
<div class="inputForm">${createGroupSelector(response.groups)}</div> 
<div class="formMessage">${msg}</div>`; 
       e.innerHTML += form;
      })
      .catch (e => {
        console.log(e);
      });
}

function createNamedInputForm(args) {
  let {element, name, id, value, onChange, type, msg} = args;
  let form =`
<div class="formLabel">${name}</div>
<div class="${id}Form"><input onchange="${onChange}()" value="${value}" type="${type}" id="${id}Form"></input></div>
<div class="formMessage">${msg}</div>`;
  element.innerHTML += form;
  return element;
}

function formatTags(tags) {
  var formattedTags = [];
  tags.forEach(function (tag) {
    var formattedTag = `<a target="_tag" href="./?tag=${tag}"><span class="annotationTag">${tag}</span></a>`;
    formattedTags.push(formattedTag);
  });
  return formattedTags.join(' ');
}

function csvRow(level, anno) {
  var fields = [level.toString(), anno.updated, anno.url, anno.user, anno.id, anno.group, anno.tags.join(', '), anno.quote, anno.text];
  fields = fields.map(function (field) {
    if (field) {
      field = field.replace(/"/g, '""'); // escape double quotes
      field = field.replace(/\r?\n|\r/g, ' '); // remove cr lf
      field = `"${field}"`; // quote the field
    }
    return field;
    });
  return fields.join(',');
}

function showAnnotation(anno, level) {
  var dt = new Date(anno.updated);
  var dt_str = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString().replace(/:\d{2}\s/, ' ');

  var html = anno.text == null ? '' : anno.text;
  var converter = new Showdown.converter();
  html = converter.makeHtml(html);

  var tags = '';
  if (anno.tags.length) {
    tags = formatTags(anno.tags);
  }

  var user = anno.user.replace('acct:', '').replace('@hypothes.is', '');

  var quote = anno.quote;

  if (anno.quote) {
    quote = `<div class="annotationQuote">${anno.quote}</div>`;
  }

  var standaloneAnnotationUrl = `https://hypothes.is/a/${anno.id}`;

  var marginLeft = level * 20;

  var groupSlug = 'in Public';
  if (anno.group !== '__world__') {
    groupSlug = `
in group 
<span class="groupid"><a title="search group" target="_group" href="./?group=${anno.group}">${anno.group}</a>
</span>`;
  }

  var output = `
<div class="annotationCard" style="display:block; margin-left:${marginLeft}px;">
  <div class="csvRow">${csvRow(level,anno)}</div>
  <div class="annotationHeader">
    <span class="user">
      <a title="search user" target="_user"  href="./?user=${user}">${user}</a>
    </span>
    <span class="timestamp"><a title="view/edit/reply"  target="_standalone" href="${standaloneAnnotationUrl}">${dt_str}</a>
    </span>

  ${groupSlug}

  </div>
  <div class="annotationBody">
    ${quote}
     <div>
       ${html}
     </div>
     <div class="annotationTags">
        ${tags}
     </div>
  </div>  
</div>`
  return output;
}

function delay(seconds) {
  return new Promise( resolve => setTimeout(resolve, seconds * 1000));
}

async function waitSeconds(seconds) {
  await delay(seconds);
  return;
}

// https://gist.github.com/monsur/706839
/**
 * XmlHttpRequest's getAllResponseHeaders() method returns a string of response
 * headers according to the format described here:
 * http://www.w3.org/TR/XMLHttpRequest/#the-getallresponseheaders-method
 * This method parses that string into a user-friendly key/value pair object.
 */
function parseResponseHeaders(headerStr) {
  var headers = {};
  if (!headerStr) {
    return headers;
  }
  var headerPairs = headerStr.split('\u000d\u000a');
  for (var i = 0; i < headerPairs.length; i++) {
    var headerPair = headerPairs[i];
    // Can't use split() here because it does the wrong thing
    // if the header value has the string ": " in it.
    var index = headerPair.indexOf('\u003a\u0020');
    if (index > 0) {
      var key = headerPair.substring(0, index);
      var val = headerPair.substring(index + 2);
      headers[key] = val;
    }
  }
  return headers;
}