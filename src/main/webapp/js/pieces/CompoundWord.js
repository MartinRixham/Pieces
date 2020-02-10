define(["./Library"], function() {

	function CompoundWord(getCurrentIndex) {

		var words = [];

		var router;

		this.get = function(nonBlank) {

			if (words[getCurrentIndex()]) {

				return words[getCurrentIndex()].get(nonBlank);
			}
			else {

				return "";
			}
		};

		this.set = function(word, routeIndex, callback) {

			if (words[getCurrentIndex()]) {

				words[getCurrentIndex()].set(word, routeIndex, callback);
			}
		};

		this.add = function(i, word) {

			words[i] = word;

			word.set(router.getWord(), router.getIndex(), function() {});
		};

		this.hasIndex = function(i) {

			return !!words[i];
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
