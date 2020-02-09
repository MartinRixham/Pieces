define(["./Library"], function() {

	function CompoundWord(i) {

		var words = [];

		var index = i;

		var router;

		this.get = function(nonBlank) {

			if (words[index]) {

				return words[index].get(nonBlank);
			}
			else {

				return "";
			}
		};

		this.set = function(word, routeIndex, callback) {

			if (words[index]) {

				words[index].set(word, routeIndex, callback);
			}
		};

		this.add = function(i, word) {

			words[i] = word;

			word.set(
				index == i ? router.getWord() : "",
				router.getIndex(),
				function() {});
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
