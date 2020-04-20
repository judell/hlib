# hlib

JS support for Hypothesis-based projects

Used by:

https://github.com/judell/facet

https://github.com/judell/zotero

https://github.com/judell/HypothesisFootnotes

https://github.com/judell/ContributorFocus

https://github.com/judell/StudentReview

https://github.com/judell/FactCheck

https://github.com/judell/ClaimReview

https://github.com/judell/ClimateFeedbackExport

https://github.com/judell/CrossLink

https://github.com/judell/SingleAnnotationWithReplies

https://github.com/judell/ClinGen
 
https://github.com/judell/CopyAnnotations

https://github.com/judell/HelloWorldAnnotated

https://github.com/judell/AnnotationPoweredSurvey

https://github.com/judell/TagRename

## Documentation

http://jonudell.info/hlib/doc/modules/_hlib_.html

## Running tests

1. python server.py

2. Open localhost:8000, run:

```
localStorage.setItem('h_token', 'HYPOTHESIS_API_TOKEN');
localStorage.setItem('h_user', 'HYPOTHESIS_USERNAME');
localStorage.setItem('h_subjectUserTokens', JSON.stringify({ HYPOTHESIS_USERNAME: "HYPOTHESIS_API_TOKEN" }));
```

3. http://localhost:8000/test.html
