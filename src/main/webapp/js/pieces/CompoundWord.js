define(["./Library"], function() {

	function CompoundWord(i) {

		var words = [];

		var index = i;

		var deferredSet = [];

		var router;

		this.get = function() {

			return words[index].get();
		};

		this.set = function(word, routeIndex, callback) {

			if (words[index]) {

				words[index].set(word, routeIndex, callback);
			}
			else {

				deferredSet[index] = arguments;
			}
		};

		this.add = function(index, word) {

			words[index] = word;

			if (deferredSet[index]) {

				word.set.apply(word, deferredSet[index]);

				deferredSet.splice(index, 1);
			}
		};

		this.hasIndex = function(i) {

			return !!words[i];
		};

		this.setIndex = function(i) {

			index = i;
		};

		this.setRouter = function(r) {

			router = r;
		};

		this.getRouter = function() {

			return router;
		};
	}

	return CompoundWord;
});
