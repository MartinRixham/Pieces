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

		var self = this;

		this.setUpdating = function() {

			updating++;
		};

		this.addRoute = function(word) {

			var index = routes.length;

			routes.push(word);

			updating++;

			word.set(words[index], index, function() {});

			return {

				setUpdating: function() {

					self.setUpdating(index);
				},
				changePage: function() {

					self.changePage(index);
				},
				update: function() {

					self.update(index);
				},
				getIndex: function() {

					return index;
				}
			};
		};

		this.update = function(index) {

			var words = [];
			var maxIndex = Math.min(routes.length, index + 1);

			for (var i = 0; i < maxIndex; i++) {

				words[i] = routes[i].get();
			}

			if (updating > 0) {

				updating--;

				return;
			}

			var oldHash = location.hash;

			location.hash = words.join("/");

			if (oldHash != location.hash) {

				changedHash = true;
			}
		};

		this.changePage = function(index) {

			routes.splice(index + 1);
			words.splice(index + 1);
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
