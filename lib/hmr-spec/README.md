# WIP Hmr Spec Format

```js
testHmr`
  # test title

  ---- my-file.txt ----

  File content

  ::0 first HMR case (inline)

  ::1:: rest of this line is comment
    second HMR case

  ****

  ::0 first HMR case (inline)

  ::1::
    second HMR case
`
```

### on the root (single line) scope:

- 1st function is pre
- 2nd function is post
- 3rd function is crash (forbidden)

**NOTE** This is irrelevant of code / text relative positions

### only 1 block condition with functions per hmr case

- alternates: sub, assert, sub, assert, sub

**NOTE** this is position dependent!

#### HTML steps

1. read entire app html (`$('#app').innerHTML`)
2. assert matches expected

Only the value of the last HTML step in used for the block that contains the steps definition.

### styles can be mixed

resulting order is:

1. root before
2. sub 0
3. assert 0
4. sub 1
5. assert 1
6. ...
7. last: root after

```
<h2>
::0::
  ${function* sub() {...}}         ->  0.1 sub

  ${function* expectEmpty() {...}} ->  0.1 sub

  I am Carlos                      ->  0.1 asserts
                                           '<h2>I am Carlos (uncond cond)</h2>'

  ${function* clickButton() {}}    ->  0.2 sub

  I am Clicked                     ->  0.2 asserts
                                           '<h2>I am Clicked (uncond cond)</h2>'

  ${function* sub() {}}            ->  0.3 sub
::
::0 (uncond cond)
</h2>
```
