define([], function() {

	var routes = [];

	var words = location.hash.substring(1).split("/");

	var changedHash = false;

	var updating = 0;

	window.addEventListener("hashchange", function() {

		if (changedHash) {

			changedHash = false;

			return;
		}

		words = location.hash.substring(1).split("/");

		for (var i = 0; i < routes.length; i++) {

			updating++;

			routes[i].set(words[i], i, function() {

				routes.splice(i + 1);
			});
		}
	});

	function Route() {

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

		this.reset = function() {

			routes = [];
			words = location.hash.substring(1).split("/");
			changedHash = false;
			updating = 0;
		};
	}

	return Route;
});
