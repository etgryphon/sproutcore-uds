// ==========================================================================
// SCUDS Framework - Buildfile
// copyright (c) 2009 - Evin Grano, and contributors
// ==========================================================================

// ........................................
// BOOTSTRAP
// 
// The root namespace and some common utility methods are defined here. The
// rest of the methods go into the mixin defined below.

/**
  @namespace
  
  The SCUDS namespace.  All SCUDS methods and functions are defined
  inside of this namespace.  You generally should not add new properties to
  this namespace as it may be overwritten by future versions of SCUDS.
  
  You can also use the shorthand "SCUDS" instead of "Scuds".
*/
window.Scuds = window.Scuds || SC.Object.create();
window.SCUDS = window.SCUDS || window.Scuds ;

