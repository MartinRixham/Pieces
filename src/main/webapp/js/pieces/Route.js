define([], function() {

	var routes = [];

	window.addEventListener("hashchange", function() {

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
		};

		this.update = function() {

			var route = new Array(routes.length);

			for (var i = 0; i < routes.length; i++) {

				route[i] = routes[i].get();
			}

			location.hash = route.join("/");
		};

		this.reset = function() {

			routes = [];
		};
	}

	return Route;
});
