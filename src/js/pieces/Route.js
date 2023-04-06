define([], function() {

	var routes = [];

	var words = location.hash.substring(1).split("/");

	var changedHash = 0;

	var updating = 0;

	var route = new Route();

	addEventListener("hashchange", function() {

		if (changedHash) {

			changedHash--;

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
				update: function(reference) {

					self.update(index, reference);
				},
				getIndex: function() {

					return index;
				},
				getWord: function() {

					return words[index];
				},
				get: function() {

					return this;
				}
			};
		};

		this.update = function(index, reference) {

			var wordList = [];
			var maxIndex = Math.min(routes.length, index + 1);
			var nonBlank = false;

			for (var i = maxIndex - 1; i >= 0; i--) {

				wordList[i] = routes[i].get(nonBlank, reference);

				nonBlank = nonBlank || !!wordList[i];
			}

			if (updating > 0) {

				updating--;

				return;
			}

			if (words[index] == wordList[index]) {

				return;
			}

			var oldHash = location.hash;
			var hash = wordList.join("/");

			// remove trailing slashes.
			hash = "#" + hash.replace(/\/+$/, "");

			if (oldHash != hash) {

				changedHash++;
			}

			words = wordList;
			location.hash = hash;
		};

		this.changePage = function(index) {

			for (var i = 0; i < routes.length; i++) {

				routes[i].dispose = true;
			}

			routes.splice(index + 1);
			words.splice(index + 1);
		};

		this.getWord = function(index) {

			return words[index];
		};
	}

	return {

		get: function() { return route; },
		set: function(newRoute) { route = newRoute; },
		reset: function() {

			routes = [];
			words = location.hash.substring(1).split("/");
			changedHash = 0;
			updating = 0;
			route = new Route();
		}
	};
});
