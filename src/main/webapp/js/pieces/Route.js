define([], function() {

	var routes = [];

	var changedHash = false;

	var updating = 0;

	window.addEventListener("hashchange", function() {

		if (changedHash) {

			changedHash = false;

			return;
		}

		var words = location.hash.substring(1).split("/");

		for (var i = 0; i < words.length; i++) {

			if (routes[i]) {

				updating++;

				routes[i].set(words[i], i);
			}
		}
	});

	function Route() {

		this.addRoute = function(word) {

			var index = routes.length;

			routes.push(word);

			var words = location.hash.substring(1).split("/");

			updating++;

			word.set(words[index], index);

			return index;
		};

		this.update = function(index) {

			var words = location.hash.substring(1).split("/");
			var route = routes[index].get();

			words.splice(index, words.length - index, route);

			updateHash(words);
		};

		this.remove = function(index) {

			routes.splice(index);

			var words = location.hash.substring(1).split("/");

			words.splice(index);

			updateHash(words);
		};

		function updateHash(words) {

			if (updating > 0) {

				updating--;

				return;
			}

			var oldHash = location.hash;
			var hash = words.join("/");

			// remove trailing slashes.
			hash = hash.replace(/\/+$/, "");

			location.hash = hash;

			if (oldHash != location.hash) {

				changedHash = true;
			}
		}

		this.reset = function() {

			routes = [];
			changedHash = false;
			updating = 0;
		};
	}

	return Route;
});
