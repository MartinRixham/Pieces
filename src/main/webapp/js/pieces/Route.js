define([], function() {

	var routes = [];

	var changedHash = false;

	window.addEventListener("hashchange", function() {

		if (changedHash) {

			changedHash = false;

			return;
		}

		var words = location.hash.substring(1).split("/");

		for (var i = 0; i < words.length; i++) {

			if (routes[i]) {

				routes[i].set(words[i]);
			}
		}
	});

	function Route() {

		this.addRoute = function(route) {

			var index = routes.length;

			routes.push(route);

			var words = location.hash.substring(1).split("/");

			route.set(words[index]);

			return index;
		};

		this.update = function(index) {

			var words = location.hash.substring(1).split("/");
			var route = routes[index].get();

			words.splice(index, words.length - index, route);

			var oldHash = location.hash;

			location.hash = words.join("/");

			if (oldHash != location.hash) {

				changedHash = true;
			}
		};

		this.remove = function(index) {

			routes.splice(index);

			var words = location.hash.substring(1).split("/");

			words.splice(index);

			var oldHash = location.hash;

			location.hash = words.join("/");

			if (oldHash != location.hash) {

				changedHash = true;
			}
		};

		this.reset = function() {

			routes = [];
		};
	}

	return Route;
});
