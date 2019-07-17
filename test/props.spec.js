const hit = require('../test-utils/testHmr')
const { testHmr, spec } = hit

// describe('HMR: props', () => {
//   testHmr`
//     # updates default slot when child changes
//
//     ---- App.svelte ----
//
//     <script>
//       import Child from './Child'
//     </script>
//
//     ::0::
//       <Child />
//     ::1:: add prop
//       <Child name="Santos" />
//     ::2:: change prop
//       <Child />
//     ::3::
//       <Child name="Santos">I am Slot</Child>
//     ::4::
//       <Child name="Santos">I am Slot</Child>
//
//     ---- Child.svelte ----
//
//     <script>
//       export let name = 'Carlos'
//     </script>
//
//     <h2>
//       ::0 <slot>I am {name}</slot>
//       ::1 <slot>I am {name}</slot>
//       ::2 <slot>I am {name}</slot>
//       ::3 <slot>I am {name}</slot>
//       ::4 I am Child
//     </h2>
//
//     ********
//
//     <h2>
//       ::0 I am Carlos
//       ::1 I am Santos
//       ::2 I am Carlos
//       ::3 I am Slot
//       ::4 I am Child
//     </h2>
//   `
//
//   //   testHmr`
//   //     updates default slot when child changes
//   //
//   //     ---- App.svelte ----
//   //
//   //     <script>
//   //       import Child from './Child'
//   //     </script>
//   //
//   //     ::0 <Child />
//   //     ::1 <Child name="Santos" />
//   //     ::2 <Child />
//   //     ::3 <Child name="Santos">I am Slot</Child>
//   //     ::4 {
//   //       <Child name="Santos">I am Slot</Child>
//   //       ${function*() {
//   //         yield this.page.click('h2')
//   //         expect(yield this.innerText('h2')).to.equal('clicked')
//   //         yield this.page.clickt('h3')
//   //       }}
//   //     }
//   //
//   //     ---- Child.svelte ----
//   //
//   //     <script>
//   //       export let name = 'Carlos'
//   //     </script>
//   //
//   //     <h2>
//   //       ::0 <slot>I am {name}</slot>
//   //       ::1 <slot>I am {name}</slot>
//   //       ::2 <slot>I am {name}</slot>
//   //       ::3 <slot>I am {name}</slot>
//   //       ::4 I am Child
//   //     </h2>
//   //
//   //     ********
//   //
//   //     <h2>
//   //       => This one is the best
//   //
//   //       -> on the root (single line) scope:
//   //           - 1st function is pre
//   //           - 2nd function is post
//   //           - 3rd function is crash (forbidden)
//   //
//   //           => NOTE this is irrelevant of code / text relative positions
//   //
//   //       -> only 1 block condition with functions per hmr case
//   //           - alternates: sub, assert, sub, assert, sub
//   //
//   //           => NOTE this is position dependent!
//   //
//   //       -> styles can be mixed
//   //           - resulting order is:
//   //               1. root before
//   //               2. sub 0
//   //               3. assert 0
//   //               4. sub 1
//   //               5. assert 1
//   //               ...
//   //               last. root after
//   //
//   //       ::0::
//   //         ${function* clickButton() {}}   ->  0.1 sub
//   //         ${function* expectEmpty() {}}   ->  0.1 sub
//   //         I am Carlos                     ->  0.1 assert
//   //         ${function* sub() {}}           ->  0.2 sub
//   //         I am Clicked                    ->  0.2 assert
//   //         ${function* sub() {}}           ->  0.3 sub
//   //       ::
//   //
//   //       ::0 ${function* before() {}}
//   //       ::0 I am Marco
//   //       ::0 ${function* after() {}}
//   //
//   //       ::1 I am Santos
//   //       ::2 I am Carlos
//   //       ::3 I am Slot
//   //       ::4 I am Child
//   //     </h2>
//   //   `
// })
