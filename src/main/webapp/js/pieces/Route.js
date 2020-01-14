define([], function() {

	var routes = [];

	var words = location.hash.substring(1).split("/");

	var changedHash = false;

	var updating = 0;

	var route = new Route();

	window.addEventListener("hashchange", function() {

		if (changedHash) {

			changedHash = false;

			return;
		}

		words = location.hash.substring(1).split("/");

		for (var i = 0; i < words.length; i++) {

			if (!routes[i]) {

				return;
			}

			updating++;

			routes[i].set(words[i], i, function() {

				routes.splice(i + 1);
			});
		}
	});

	function Route() {

		this.setUpdating = function() {

			updating++;
		};

		this.addRoute = function(word) {

			var index = routes.length;

			routes.push(word);

			updating++;

			word.set(words[index], index, function() {});

			return index;
		};

		this.update = function(index) {

			var route = routes[index].get();

			if (updating > 0) {

				updating--;

				return;
			}

			words.splice(index);

			for (var i = words.length; i < index; i++) {

				words[i] = "";
			}

			words[index] = route;

			var oldHash = location.hash;
			var hash = words.join("/");

			// remove trailing slashes.
			hash = hash.replace(/\/+$/, "");

			location.hash = hash;

			if (oldHash != location.hash) {

				changedHash = true;
			}
		};

		this.changePage = function(index) {

			routes.splice(index + 1);
		};
	}

	return {

		get: function() { return route; },
		set: function(newRoute) { route = newRoute; },
		reset: function() {

			routes = [];
			words = location.hash.substring(1).split("/");
			changedHash = false;
			updating = 0;
			route = new Route();
		}
	};
});
