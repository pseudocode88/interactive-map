# Project Brief
Our goal is to build a interactive map react component that I can plug and play to the other nextjs projects. 

## More Details
The component should use canvas based using threejs for smooth working. The component should be responsive and take the width and height of the parent container. Also there should be option to manage the width and height through css.

The map contains multiple items provided as png files and render as stack on different z-index. Some elements in the map are animated like bounce or translate in a direction in loop. So the elements should be configurable.

On top of the map there should be markers and on click on the marker trigger an event.

## Map Behaviour
- Should be able to pan, but the boundaries are fixed which is calculated based on the base image
- Should be able to zoom in and out, but the range is bounded.