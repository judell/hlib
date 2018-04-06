function httpRequest(opts) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url);
    xhr.onload = function() {
      if (this.status >= 200 && this.status < 300) {
        resolve({
          response: xhr.response, 
          status: xhr.status
        });
      } else {
        console.log("http", opts.url, this.status);
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function() {
      console.log("makeRequest", opts.url, this.status);
      reject({
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

  if (progressId) {
    getById(progressId).innerHTML += '.';
  }

  var opts = {
    method: 'get',
    url: `https://hypothes.is/api/search?_separate_replies=true&limit=200&offset=${offset}`,
  };

  var facets = ['group', 'user', 'tag', 'url', 'any'];

  facets.forEach(function(facet){
    if (params[facet]) {
      var encodedValue = encodeURIComponent(params[facet]);
      opts.url += `&${facet}=${encodedValue}`;
    }   
  })

  opts = setApiTokenHeaders(opts);

  httpRequest(opts)
    .then( function (data) {
      data = JSON.parse(data.response);
      if ( data.rows.length === 0 || annos.length >= 2000 ) {
        if (progressId) {
          getById(progressId).innerHTML = '';
        }
        callback (annos, replies);
      }
      else {
        annos = annos.concat(data.rows);
        replies = replies.concat(data.replies);
        _search(params, callback, offset+200, annos, replies, progressId)
      }
    });
  }

function hApiSearch(params, callback, progressId) {
  var offset = 0;
  var annos = [];
  var replies = [];
  _search(params, callback, offset, annos, replies, progressId)
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
    console.log(e);
  }

  var isReply = refs.length > 0;

  return {
    id: id,
    url: url,
    updated: updated,
    title: title,
    refs: refs,
    isReply: isReply,
    user: user,
    text: text,
    quote: quote,
    tags: tags,
    group: group
  };
}

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

function getDomainFromUrl(url) {
  var a = document.createElement('a');
  a.href = url;
  return a.hostname;
} 

function setApiTokenHeaders(opts) {
  var token = getToken()
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
  return getFromUrlParamOrLocalStorage('h_group');
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

  if ( key === 'h_token') {
    return value;
  }

  if ( ! value ) {
    if ( _default ) {
      value = _default;
    } else {
      value = '';
    }
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

function createAnnotationPayload(uri, exact, username, group, text, tags, extra, pagenote){
  var target = {
    "source": uri,
    "selector": [{
      "exact": exact,
      "prefix": '',
      "type": "TextQuoteSelector",
      "suffix": '',
      }]
    }

  var payload = {
    "uri": uri,
    "group": group,
    "permissions": createPermissions(username, group),
    "text": text,
    "target": [target],
    "document": {
      "title": [uri],
    },
    "tags": tags ? tags : [],
  }

  if (extra) {
    payload.extra = extra;
  }

  if (pagenote) {
    delete payload.target;
  }

  return JSON.stringify(payload);
}

function postAnnotation(payload, token, resultElement, queryFragment) {
  var url = 'https://hypothes.is/api/annotations'
  var opts = {
    method: 'post',
    params: payload,
    url: url,
  };

  opts = setApiTokenHeaders(opts);

  httpRequest(opts)
    .then( function(data) {

      if (data.status != 200) {
        alert(`hlib status ${data.status}`);
        return;
      }
      var url = JSON.parse(data.response).uri;
      if (queryFragment) {
        url += '#' + queryFragment;
      }
      location.href = url;
    } );
}

function updateAnnotation(id, token, payload) {
  var url = `https://hypothes.is/api/annotations/${id}`;
  var opts = {
    method: 'put',
    params: payload,
    url: url,
  };

  opts.headers = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json;charset=utf-8',
    };

  httpRequest(opts)
    .then( function(data) {
      console.log(data);
      return(data);
    } );
}

function createApiTokenInputForm (e) {
  var token = getToken();
  var msg = 'to write (or read private/group) annotations, include <a href="https://hypothes.is/profile/developer">API token</a>)';
  var form = `
<div class="formLabel">API Token</div>
<div class="inputForm"><input type="password" value="${token}" onchange="setToken()"  size="40" id="tokenForm"></input></div>
<div class="formMessage">${msg}</div>`;
  e.innerHTML += form;
}

function createUserInputForm (e) {
  var user = getUser();
  var msg = '';
  var form = `
<div class="formLabel">Hypothesis username</div>
<div class="inputForm"><input type="text" size="20" value="${user}" onchange="setUser()" id="userForm"></input></div> 
<div class="formMessage">${msg}</div>`; 
  e.innerHTML += form;
}

function createGroupInputForm (e) {
  var group = getGroup();
  var msg = 'ID from https://hypothes.is/groups/ID';
  var form = `
<div class="formLabel">Hypothesis Group ID</div>
<div class="inputForm"><input type="text" size="20" value="${group}" onchange="setGroup()" id="groupForm"></input></div> 
<div class="formMessage">${msg}</div>`; 
  e.innerHTML += form;
}


