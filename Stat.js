function Stat( opts ){

	var thisStat = this;

	var options = {
		id: opts.id,
		name: opts.name,
		proxy_value_previous: !isNaN( opts.proxy_value ) ? opts.proxy_value : 0,
		base_value: !isNaN( opts.base_value ) ? opts.base_value : 0,
		proxy_value: !isNaN( opts.proxy_value ) ? opts.proxy_value : 0,
		minimum_value: !isNaN( opts.minimum_value ) ? opts.minimum_value : Number.NEGATIVE_INFINITY, // this is the absolute lowest the stat is allowed to go.
		minimum_boundary: !isNaN( opts.minimum_boundary ) ? opts.minimum_boundary : -10, // This value is presented as the lowest a stat can go, but this boundary is not enforced; it's only for presentation (showing a visual maximum).
		maximum_value: !isNaN( opts.maximum_value ) ? opts.maximum_value : Number.POSITIVE_INFINITY,
		maximum_boundary: !isNaN( opts.maximum_boundary ) ? opts.maximum_boundary : 10, // This value is presented as the highest that the stat can go, but this boundary is not enforced.
		increment_by: opts.increment_by || false, // this is the unit to enforce for incrementing. Could be 1, for example, to only count by 1's and never have decimals. If false, no increment is enforced.
		round_to_increment: opts.round_to_increment || false, // If true, a resulting mod will be clamped to the nearest options.increment_by value. If this is false, a number that does not obey the increment will throw an error.
		cancel_on_min_max_breach: opts.cancel_on_min_max_breach || false, // If true, a value that breaches min or max value will cancel the mod operation. If false, the value will be modified up to the min/max but not beyond.
	};

	// only these numeric properties may be modded using the rules enforced by the mod function. Other properties or non-float/int data types wouldn't make sense to apply these rules to. 
	var mod_properties = ["base_value", ];


	this.get = function( property_name ){
		return options[ property_name ];
	}

	this.set = function( property_name, val ){

		if( options.hasOwnProperty( property_name ) ){

			options[ property_name ] = val;

			return val;

		}

		return false;
	}

	this.value = function(){
		return options['proxy_value'];
	}

	this.reset = function(){
		options['proxy_value'] = options['base_value'];
		return options['proxy_value'];
	}

	this.config = function() {
	    console.log( JSON.stringify( options ) );
	};

	var hooks = {};

	this.checkHooks = function( newvalue ){

		for( var key in hooks ){
			// cycle through the available hooks below.

			if( hooks.hasOwnProperty( key ) ){

				if( ! hooks[ key ].enabled ) continue; // if the hook is disabled, move on to the next one.

				var runhook = false; // hook will not run unless it passes the threshold conditions.

				if( hooks[ key ].threshold == "=" && newvalue == hooks[ key ].val ){

					runhook = true;

				} else if( hooks[ key ].threshold == "<" && newvalue < hooks[ key ].val ){
					// we have crossed the threshold to activate this hook.

					// if cross_to_activate is eabled, we need to check if the threshold was just crossed now.
					if( hooks[ key ].cross_to_activate && options['proxy_value_previous'] >= hooks[ key ].val ){
						// success, we can run the hook.
						runhook = true;

					} else if( ! hooks[ key ].cross_to_activate ){
						// we can run the hook because the value only has to be under the threshold, not just cross it.

						runhook = true;

					}

				} else if( hooks[ key ].threshold == ">" && newvalue > hooks[ key ].val ){
					// this is pretty much the same as the logic above for "<" except reversed for the other direction ">"
					if( hooks[ key ].cross_to_activate && options['proxy_value_previous'] <= hooks[ key ].val ){
						runhook = true;
					} else if( ! hooks[ key ].cross_to_activate ){
						runhook = true;
					}
				}

				if( runhook ){
					hooks[ key ].func.apply( thisStat );
				}
			}

		}

	}

	this.registerHook = function( name, val, threshold, cross_to_activate, func, enabled ){
		// name is a unique name for the hook
		// val is the number at which the hook should run. float.
		// threshold is whether the hook is activated at, above, or below the val. string (see below)
			// Values are newvalue is less than val "<"
			// newvalue is greater than val ">"
			// newvalue is equal to val "="
		// cross_to_activate determines whether the threshold must be crossed to activate (true), or if it activates on each modification beyond the threshold (false). bool.
		// func is the code to execute when the conditions are met. function.
		// enabled is simply whether the hook is active or not. bool.

		hooks[ name ] = {
			val: val,
			threshold: threshold,
			cross_to_activate: cross_to_activate,
			func: func,
			enabled: enabled
		};

	}

	this.toggleHook = function( id, turn_on_or_off ){
		// id = unique identifier/key for hook
		// turn_on_or_off modifies hook's enabled property, bool.
		if( hooks.hasOwnProperty( id ) ){
			hooks[ id ].enabled = turn_on_or_off;

			return true; // succeeded.
		}

		return false; // no hook by that name.
	}

	this.mod = function( a, b, c ){

		if( typeof a === 'string' && typeof b === 'number' && mod_properties.indexOf( a ) > -1 ){
		// arguments are property_name (string), amount (float), test (bool)
			var property_name = a;
			var amount = b;
			var test = c;
		} else if( typeof a === 'number' ){
		// arguments are amount (float), test (bool). property_name is implied to be 'proxy_value'.
			var property_name = 'proxy_value';//default to mod proxy value
			var amount = a;
			var test = b;
		} else {
console.warn('Stat.mod() argument 0 must be a mod-able property name (string) or an amount (float). Mod-able properties include: ' + mod_properties.join(", ") );
			return false;
		}

		var property_value = options[ property_name ];

		var property_modified = property_value + amount;

		var constraint_check = check_min_max( property_modified );

		if( ! constraint_check ){

			if( options['cancel_on_min_max_breach'] ){

console.warn('The mod resulted in a min-max breach. Mod failed.');
				return false;

			} else {

				if( test ){

					return false;
console.warn('Min-max breach, but cancel_on_min_max_breach is false. The mod will clamp the result, but is technically invalid for testing purposes. Returning false.');

				} else {

					// logic to set property_modified to either max or min value, depending on which one we actually ran into.
					property_modified = clamp_min_max( property_modified );

				}

			}
		}

		if( options['increment_by'] ){

			var increment_check = check_increment( property_modified );
			// if this is true, property_modified fits the increment_by, and we can continue down to the test portion of the function.

			if( ! increment_check && options['round_to_increment'] ){
				// the property_modified did not fit the increment_by. However, we can round it.

				var property_modified_clamped = clamp_increment( property_modified );

				if( check_min_max( property_modified_clamped ) ){
					// make sure we still fit the min-max after clamping.

					property_modified = property_modified_clamped; // modify our property_modified var so we can keep going.

				} else {
					// clamping went out of bounds. Mod failure.

console.warn('Increment clamp resulted in a min-max breach. Mod failed.');
					return false;
				}

			} else if( ! increment_check && ! options['round_to_increment'] ){
				// the property_modified did not fit the increment_by, and we are not allowed to fix it. Mod failed.

console.warn('The mod amount did not fit the increment, and round_to_increment is turned off. Mod failed.');
				return false;
			}

		}

		if( test ){
			// we only want to know if the mod is valid and follows the rules.

			// we haven't returned false yet, so the operation would succeed.

			return true;

		} else {

			if( property_name == 'proxy_value' ){

				// log previous value before we update it.
				options[ 'proxy_value_previous' ] = options[ property_name ];

				// TODO implement hook only for proxy_value changes.
				this.checkHooks( property_modified );

			}

			options[ property_name ] = property_modified;

			return property_modified;

		}

	}

	function check_min_max( value ){
		// If value is at or above the min and at or above the max, it returns true. If value is above the max or below the min, it returns false.

		if( value > options['maximum_value'] || value < options['minimum_value'] ){
			return false;
		}

		return true;

	}

	function clamp_min_max( value ){

		if( value > options['maximum_value'] ){
			return options['maximum_value'];
		}

		if( value < options['minimum_value'] ){
			return options['minimum_value'];
		}

		return value;
	}

	function clamp_increment( value ){
	// clamp the value to the nearest valid increment.

		if( options['increment_by'] && options['round_to_increment'] ){

			// round the number to the proper increment

			var clamped;

			var round_direction = value % options['increment_by'] / options['increment_by'];

			if( round_direction < 0.5 ){

				clamped = value - value % options['increment_by'];

			} else {

				clamped = value - value % options['increment_by'] + options['increment_by'];

			}

			return clamped;

		} else {

			return false;

		}
	}

	function check_increment( value ){
		// If the value has been incremented by a multiple of the increment_by property, then return true.

		if( value % options['increment_by'] === 0 ){
			return true;
		}

		return false;
	}

}
