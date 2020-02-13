define(["./Library"], function() {

	function CompoundWord(getCurrentIndex) {

		var words = [];

		var router;

		this.get = function(nonBlank, reference) {

			var word = "";

			for (var i = 0; i < words.length; i++) {

				if (words[i]) {

					var got = words[i].get(nonBlank, reference);

					if (getCurrentIndex() == i) {

						word = got;
					}
				}
			}

			return word;
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

		this.remove = function(i) {

			words.splice(i, 1);
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
